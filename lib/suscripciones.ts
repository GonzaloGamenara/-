import { addMonths, dueDate, monthStart } from "./format";
import { compact, normNote, SUBS_RE } from "./autoCategoria";
import { mine, type Card, type Category, type Kind, type Purchase, type Recurring } from "./types";

/**
 * Radar de suscripciones: cuánto te cuesta cada cosa que se cobra sola (por mes y por año),
 * si cambió de precio y qué gastos parecen suscripciones aunque no las tengas como fijo.
 * Todo sale de tus propios movimientos: nada de servicios externos.
 */

/** Lo mínimo de un movimiento que necesita el radar */
export interface HistTx {
  id: string;
  kind: Kind;
  amount: number;
  my_share?: number | null;
  category_id: string | null;
  note: string | null;
  occurred_on: string;
  recurring_id: string | null;
  period: string | null;
  card_id?: string | null;
  purchase_id?: string | null;
}

export interface PriceChange {
  from: number;
  to: number;
  /** Variación en %, con signo */
  pct: number;
  /** Mes del primer cobro con el precio nuevo; null si todavía no se cobró (cambiaste el monto del fijo) */
  period: string | null;
}

/** Cambios de menos del 1% (o de menos de $50) son redondeos del banco, no aumentos */
const changed = (a: number, b: number) => Math.abs(b - a) >= 50 && Math.abs(b - a) / Math.max(a, 1) >= 0.01;

/** El último cambio de precio de una serie de cobros ordenada por mes */
export function priceChange(points: { period: string | null; amount: number }[]): PriceChange | null {
  for (let i = points.length - 1; i > 0; i--) {
    const [a, b] = [points[i - 1].amount, points[i].amount];
    if (changed(a, b)) return { from: a, to: b, pct: ((b - a) / a) * 100, period: points[i].period };
  }
  return null;
}

/** Un cambio es "reciente" si se cobró este mes o el anterior, o si todavía no se cobró */
export const isRecent = (c: PriceChange, thisMonth: string) => c.period === null || c.period >= addMonths(thisMonth, -1);

const norm = (s: string) => normNote(s);
/** "Meli+ (Visa Santander)" → "Meli+" · "Merpago*SPOTIFY" → "Spotify" */
export function cleanName(note: string) {
  const n = note
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^(merpago|mercadopago|payu\*ar|payu|dlocal|dlo|pvs|paymovil|mp)\*/i, "")
    .trim();
  if (!n) return note.trim();
  // "SPOTIFY" del resumen del banco → "Spotify"
  return n === n.toUpperCase() && /[A-Z]{3}/.test(n) ? n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : n;
}
const keyOf = (s: string) => compact(norm(cleanName(s)));
const sameKey = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

export const isSubsCategory = (c: Category | undefined) => !!c && norm(c.name) === "suscripciones";

export type SubGroup = "suscripcion" | "fijo";

export interface SubItem {
  r: Recurring;
  group: SubGroup;
  /** Lo que cuesta por mes y por año con el monto actual */
  monthly: number;
  yearly: number;
  card: Card | null;
  lastCharge: { date: string; amount: number } | null;
  /** Próximo cobro (null si está pausado) */
  nextDate: string | null;
  change: PriceChange | null;
}

/** Último movimiento de cada mes (por si hay dos cargas del mismo cobro) */
function perMonth(rows: HistTx[]) {
  const by = new Map<string, HistTx>();
  for (const t of rows) {
    const m = t.period ?? t.occurred_on.slice(0, 7);
    const prev = by.get(m);
    if (!prev || t.occurred_on >= prev.occurred_on) by.set(m, t);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function trackedItems(recurring: Recurring[], hist: HistTx[], categories: Category[], cards: Card[], today: string): SubItem[] {
  const thisMonth = today.slice(0, 7);
  const cat = (id: string | null) => categories.find((c) => c.id === id);
  return recurring
    .filter((r) => r.kind === "expense")
    .map((r) => {
      const card = r.card_id ? (cards.find((c) => c.id === r.card_id) ?? null) : null;
      const group: SubGroup = card || isSubsCategory(cat(r.category_id)) || SUBS_RE.test(norm(r.name)) ? "suscripcion" : "fijo";
      const charges = perMonth(hist.filter((t) => t.recurring_id === r.id));
      const points: { period: string | null; amount: number }[] = charges.map(([m, t]) => ({ period: m, amount: t.amount }));
      const last = charges.at(-1)?.[1] ?? null;
      // Si cambiaste el monto del fijo y todavía no se cobró, ya cuenta como cambio.
      // Si el monto es uno que ya se cobró antes, el último cobro distinto fue algo puntual del banco.
      if (r.active && last && points.every((p) => changed(p.amount, r.amount))) points.push({ period: null, amount: r.amount });
      const day = card?.due_day ?? r.day;
      const chargedNow = charges.some(([m]) => m === thisMonth) || dueDate(thisMonth, day) <= today;
      return {
        r,
        group,
        monthly: r.amount,
        yearly: r.amount * 12,
        card,
        lastCharge: last ? { date: last.occurred_on, amount: last.amount } : null,
        nextDate: r.active ? dueDate(chargedNow ? addMonths(thisMonth, 1) : thisMonth, day) : null,
        change: priceChange(points),
      };
    })
    .sort((a, b) => Number(b.r.active) - Number(a.r.active) || b.monthly - a.monthly);
}

export interface Candidate {
  key: string;
  name: string;
  /** Último monto (tu parte, si estaba dividido) */
  amount: number;
  categoryId: string | null;
  cardId: string | null;
  day: number;
  lastDate: string;
  /** En cuántos meses distintos apareció */
  months: number;
  /** Un movimiento por mes, para engancharlos al fijo si la agregás */
  link: { id: string; period: string }[];
  change: PriceChange | null;
  why: "categoria" | "servicio" | "repite";
}

/** Gastos que parecen suscripciones pero no están cargados como fijos */
export function detectCandidates(hist: HistTx[], recurring: Recurring[], categories: Category[], purchases: Purchase[], today: string): Candidate[] {
  const thisMonth = today.slice(0, 7);
  const from = monthStart(addMonths(thisMonth, -5));
  const recentFrom = monthStart(addMonths(thisMonth, -2));
  const subsCat = categories.find(isSubsCategory);
  const enCuotas = new Set(purchases.filter((p) => p.installments > 1).map((p) => p.id));
  const tracked = recurring.map((r) => keyOf(r.name));

  const groups = new Map<string, HistTx[]>();
  for (const t of hist) {
    if (t.kind !== "expense" || t.recurring_id || !t.note || t.occurred_on < from || t.occurred_on > today) continue;
    if (t.purchase_id && enCuotas.has(t.purchase_id)) continue;
    if (mine(t) <= 0) continue;
    const k = keyOf(t.note);
    if (k.length < 3 || tracked.some((r) => sameKey(r, k))) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const out: Candidate[] = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const last = rows.at(-1)!;
    if (last.occurred_on < recentFrom) continue;
    const counts = new Map<string, number>();
    for (const t of rows) counts.set(t.occurred_on.slice(0, 7), (counts.get(t.occurred_on.slice(0, 7)) ?? 0) + 1);
    const months = counts.size;
    const maxPerMonth = Math.max(...counts.values());
    const lastAmount = mine(last);

    let why: Candidate["why"] | null = null;
    if (maxPerMonth <= 2 && subsCat && rows.some((t) => t.category_id === subsCat.id)) why = "categoria";
    else if (maxPerMonth <= 2 && SUBS_RE.test(norm(last.note!))) why = "servicio";
    else if (months >= 2 && maxPerMonth === 1 && rows.every((t) => Math.abs(mine(t) - lastAmount) <= lastAmount * 0.15)) why = "repite";
    if (!why) continue;

    const monthly = perMonth(rows);
    out.push({
      key,
      name: cleanName(last.note!),
      amount: lastAmount,
      categoryId: last.category_id,
      cardId: last.card_id ?? null,
      day: Number(last.occurred_on.slice(8, 10)),
      lastDate: last.occurred_on,
      months,
      link: monthly.map(([period, t]) => ({ id: t.id, period })),
      change: priceChange(monthly.map(([period, t]) => ({ period, amount: mine(t) }))),
      why,
    });
  }
  return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export interface SubTotals {
  subsMonthly: number;
  fijosMonthly: number;
  pausedMonthly: number;
  subsCount: number;
}

export function subTotals(items: SubItem[]): SubTotals {
  let subsMonthly = 0;
  let fijosMonthly = 0;
  let pausedMonthly = 0;
  let subsCount = 0;
  for (const i of items) {
    if (!i.r.active) pausedMonthly += i.monthly;
    else if (i.group === "suscripcion") {
      subsMonthly += i.monthly;
      subsCount++;
    } else fijosMonthly += i.monthly;
  }
  return { subsMonthly, fijosMonthly, pausedMonthly, subsCount };
}
