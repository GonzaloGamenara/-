import { mine, type Category, type Recurring, type Transaction } from "./types";
import { currentMonth, daysInMonth, dueDate, todayISO } from "./format";

/** Suma lo que te toca a vos (si un gasto está dividido, solo tu parte) */
const sum = (xs: Transaction[]) => xs.reduce((a, t) => a + mine(t), 0);

export interface CatSlice {
  id: string | null;
  name: string;
  emoji: string;
  color: string;
  total: number;
  count: number;
  share: number;
}

export function byCategory(txs: Transaction[], cats: Category[]): CatSlice[] {
  const map = new Map<string | null, { total: number; count: number }>();
  for (const t of txs) {
    const k = t.category_id;
    const cur = map.get(k) ?? { total: 0, count: 0 };
    cur.total += mine(t);
    cur.count++;
    map.set(k, cur);
  }
  const total = sum(txs) || 1;
  return [...map.entries()]
    .map(([id, v]) => {
      const c = cats.find((x) => x.id === id);
      return {
        id,
        name: c?.name ?? "Sin categoría",
        emoji: c?.emoji ?? "❔",
        color: c?.color ?? "#64748b",
        total: v.total,
        count: v.count,
        share: v.total / total,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface Breakdown {
  key: "daily" | "fixed" | "card" | "shared";
  label: string;
  hint: string;
  color: string;
  total: number;
}

export interface ScheduledItem {
  key: string;
  day: number;
  label: string;
  emoji: string;
  amount: number;
  kind: "income" | "expense";
}

/**
 * Métricas del mes, separando lo que YA pasó de lo que está programado:
 * - gastado: movimientos con fecha ≤ hoy (las compras con tarjeta cuentan el día que se paga el resumen)
 * - comprometido: fijos que faltan + resúmenes de tarjeta que vencen más adelante este mes
 */
export function monthStats(
  month: string,
  txs: Transaction[],
  prevTxs: Transaction[],
  cats: Category[],
  recurring: Recurring[],
  opts: {
    trackingStart: string; // YYYY-MM-DD desde que se usa la app (no se compara contra antes)
    sharedTxIds?: Set<string>;
    cardName?: (id: string) => string | undefined;
  },
) {
  const today = todayISO();
  const cm = currentMonth();
  const isCurrent = month === cm;
  const isPast = month < cm;
  const dim = daysInMonth(month);
  const elapsed = isCurrent ? Number(today.slice(8, 10)) : isPast ? dim : 0;

  const happened = (t: Transaction) => !isCurrent || t.occurred_on <= today;
  const past = txs.filter(happened);
  const future = txs.filter((t) => !happened(t));

  const expenses = past.filter((t) => t.kind === "expense");
  const incomes = past.filter((t) => t.kind === "income");
  const spent = sum(expenses);
  const earned = sum(incomes);

  // Desglose sin solapamientos: cada gasto va a un solo grupo
  const shared = opts.sharedTxIds ?? new Set<string>();
  const groupOf = (t: Transaction): Breakdown["key"] =>
    shared.has(t.id) ? "shared" : t.card_id ? "card" : t.recurring_id ? "fixed" : "daily";
  const totals = { daily: 0, fixed: 0, card: 0, shared: 0 };
  for (const t of expenses) totals[groupOf(t)] += mine(t);
  const breakdown: Breakdown[] = [
    { key: "daily", label: "Día a día", hint: "lo que cargás a mano", color: "#fb7185", total: totals.daily },
    { key: "fixed", label: "Fijos", hint: "alquiler, servicios…", color: "#a78bfa", total: totals.fixed },
    { key: "card", label: "Tarjeta", hint: "resúmenes, cuotas y suscripciones", color: "#60a5fa", total: totals.card },
    { key: "shared", label: "Compartidos", hint: "tu parte de cuentas divididas", color: "#2dd4bf", total: totals.shared },
  ];

  // Programado para lo que queda del mes
  const scheduled: ScheduledItem[] = [];
  if (isCurrent) {
    const applied = new Set(txs.filter((t) => t.period === month).map((t) => t.recurring_id));
    for (const r of recurring) {
      if (!r.active || applied.has(r.id) || dueDate(month, r.day) <= today) continue;
      if (r.card_id) continue; // las suscripciones de tarjeta van dentro de su resumen
      const c = cats.find((x) => x.id === r.category_id);
      scheduled.push({ key: `r-${r.id}`, day: r.day, label: r.name, emoji: c?.emoji ?? "🔁", amount: r.amount, kind: r.kind });
    }
    // Resúmenes de tarjeta que vencen más adelante (agrupados por tarjeta)
    const byCard = new Map<string, { day: number; amount: number }>();
    for (const t of future.filter((x) => x.kind === "expense" && x.card_id)) {
      const cur = byCard.get(t.card_id!) ?? { day: Number(t.occurred_on.slice(8, 10)), amount: 0 };
      cur.amount += mine(t);
      byCard.set(t.card_id!, cur);
    }
    for (const r of recurring) {
      if (!r.active || !r.card_id || applied.has(r.id) || dueDate(month, r.day) <= today) continue;
      const cur = byCard.get(r.card_id) ?? { day: r.day, amount: 0 };
      cur.amount += r.amount;
      byCard.set(r.card_id, cur);
    }
    for (const [id, v] of byCard) scheduled.push({ key: `c-${id}`, day: v.day, label: `Resumen ${opts.cardName?.(id) ?? "tarjeta"}`, emoji: "💳", amount: v.amount, kind: "expense" });
    // Otros movimientos con fecha futura (no tarjeta)
    for (const t of future.filter((x) => !x.card_id)) {
      const c = cats.find((x) => x.id === t.category_id);
      scheduled.push({ key: `t-${t.id}`, day: Number(t.occurred_on.slice(8, 10)), label: t.note || c?.name || "Movimiento", emoji: c?.emoji ?? "📅", amount: mine(t), kind: t.kind });
    }
    scheduled.sort((a, b) => a.day - b.day);
  }
  const committed = scheduled.filter((x) => x.kind === "expense").reduce((a, x) => a + x.amount, 0);
  const toCollect = scheduled.filter((x) => x.kind === "income").reduce((a, x) => a + x.amount, 0);

  // Ritmo del día a día: necesita algunos días para ser confiable
  const MIN_DAYS_RATE = 3;
  const MIN_DAYS_PROJECTION = 7;
  const dailyRate = elapsed >= MIN_DAYS_RATE ? totals.daily / elapsed : null;
  const projected =
    isCurrent && elapsed >= MIN_DAYS_PROJECTION && dailyRate !== null ? spent + committed + dailyRate * (dim - elapsed) : null;

  // Comparación justa: mismo tramo del mes anterior, y solo si ese mes ya se trackeaba
  const prevMonthStart = `${prevTxs[0]?.occurred_on.slice(0, 7) ?? ""}-01`;
  const day = isCurrent ? elapsed : dim;
  const prevSameSpan = sum(prevTxs.filter((t) => t.kind === "expense" && Number(t.occurred_on.slice(8, 10)) <= day));
  const comparable = prevTxs.length > 0 && prevMonthStart >= opts.trackingStart && prevSameSpan > 0 && elapsed >= 3;
  const deltaVsPrev = comparable ? (spent - prevSameSpan) / prevSameSpan : null;

  // Días del mes: gastado (pasado) y comprometido (futuro, tenue)
  const perDay = Array.from({ length: dim }, () => 0);
  const perDayPlanned = Array.from({ length: dim }, () => 0);
  for (const t of expenses) perDay[Number(t.occurred_on.slice(8, 10)) - 1] += mine(t);
  for (const x of scheduled) if (x.kind === "expense") perDayPlanned[x.day - 1] += x.amount;

  return {
    isCurrent,
    elapsed,
    dim,
    spent,
    earned,
    breakdown,
    scheduled,
    committed,
    toCollect,
    dailyRate,
    projected,
    deltaVsPrev,
    // Lo que te queda hoy, y lo que te quedaría a fin de mes si se cumple lo programado
    balanceNow: earned - spent,
    freeAtEnd: earned + toCollect - spent - committed,
    savingsRate: earned + toCollect > 0 ? (earned + toCollect - spent - committed) / (earned + toCollect) : null,
    perDay,
    perDayPlanned,
    expenseCats: byCategory(expenses, cats),
    incomeCats: byCategory(incomes, cats),
    recent: [...past].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)),
  };
}
