import { installmentAmounts } from "./cards";
import { daysInMonth, money, parseISO, toISO } from "./format";
import { mine, type Purchase, type Recurring, type Split, type Transaction } from "./types";

/**
 * Techos (presupuesto) por categoría o grupo de categorías.
 *
 * Qué cuenta para un techo y en qué fecha:
 * - Gastos normales y fijos: su fecha.
 * - Compras con tarjeta: la FECHA DE COMPRA (no la del resumen). En cuotas, la cuota k
 *   cuenta en el mes de compra + (k − 1).
 * - Siempre tu parte (monto propio), así lo dividido cuenta solo lo tuyo.
 */

export interface BudgetConfig {
  id: string;
  name: string;
  monthly: number;
  weekly: number | null;
  max_per_tx: number | null;
  /** 1 = lunes … 7 = domingo; null = todos los días */
  allowed_days: number[] | null;
  category_ids: string[];
}

export interface Budget extends BudgetConfig {
  sort: number;
}

/** Un gasto, ya ubicado en la fecha en que cuenta para los techos */
export interface BudgetItem {
  date: string;
  amount: number;
  categoryId: string | null;
  txId?: string;
  purchaseId?: string;
  /** El hecho real (pedido, compra) para controlar máximo por movimiento y días permitidos */
  event?: { date: string; amount: number; label: string };
}

export interface Excess {
  date: string;
  amount: number;
  label: string;
  reasons: string[];
}

export interface BudgetStatus {
  cfg: BudgetConfig;
  spent: number;
  /** Fijos de este mes que todavía no se cobraron */
  committed: number;
  pct: number;
  level: "ok" | "warn" | "over";
  week: { from: string; to: string; spent: number } | null;
  excesses: Excess[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
const DAY_SHORT = ["", "L", "M", "X", "J", "V", "S", "D"];
export const DAY_LETTERS = DAY_SHORT;

/** 1 = lunes … 7 = domingo */
export const isoWeekday = (iso: string) => {
  const d = parseISO(iso).getDay();
  return d === 0 ? 7 : d;
};

/** Semana de lunes a domingo que contiene esa fecha */
export function weekOf(iso: string) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - (isoWeekday(iso) - 1));
  const from = toISO(d);
  d.setDate(d.getDate() + 6);
  return { from, to: toISO(d) };
}

/** Misma fecha, n meses después (si el día no existe, el último del mes) */
export function shiftMonths(iso: string, n: number) {
  const [y, m, day] = iso.split("-").map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const ym = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  return `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, "0")}`;
}

/** "los sábados", "lunes y viernes" */
export function daysLabel(days: number[]) {
  const names = [...days].sort().map((d) => DAY_NAMES[d]);
  if (names.length === 1) return `los ${names[0]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** Todos los gastos ubicados en la fecha en que cuentan para los techos */
export function budgetItems(txs: Transaction[], purchases: Purchase[], splits: Split[]): BudgetItem[] {
  const items: BudgetItem[] = [];
  for (const t of txs) {
    // Las cuotas y compras con tarjeta se toman de la compra (fecha de compra), no del resumen
    if (t.kind !== "expense" || t.purchase_id) continue;
    const amount = r2(mine(t));
    items.push({
      date: t.occurred_on,
      amount,
      categoryId: t.category_id,
      txId: t.id,
      // Los fijos son automáticos: no se controlan contra máximo ni días
      event: t.recurring_id ? undefined : { date: t.occurred_on, amount, label: t.note ?? "" },
    });
  }
  for (const p of purchases) {
    const total = Number(p.total_amount);
    if (!(total > 0)) continue;
    const others = splits.filter((s) => s.purchase_id === p.id).reduce((a, s) => a + Number(s.amount), 0);
    const ratio = others > 0 ? Math.max(0, total - others) / total : 1;
    const amounts = installmentAmounts(total, p.installments);
    for (let k = Math.max(1, p.from_installment); k <= p.installments; k++) {
      items.push({
        date: shiftMonths(p.purchased_on, k - 1),
        amount: r2(amounts[k - 1] * ratio),
        categoryId: p.category_id,
        purchaseId: p.id,
        event: k === 1 ? { date: p.purchased_on, amount: r2(total * ratio), label: p.description } : undefined,
      });
    }
  }
  return items;
}

function excessReasons(cfg: BudgetConfig, ev: { date: string; amount: number }) {
  const reasons: string[] = [];
  if (cfg.max_per_tx && ev.amount > cfg.max_per_tx + 0.005) reasons.push(`supera el máximo de ${money(cfg.max_per_tx)} por movimiento`);
  if (cfg.allowed_days?.length && !cfg.allowed_days.includes(isoWeekday(ev.date))) {
    reasons.push(`${cfg.name} es solo ${daysLabel(cfg.allowed_days)}`);
  }
  return reasons;
}

const levelOf = (spent: number, limit: number): BudgetStatus["level"] => (spent > limit + 0.005 ? "over" : spent >= limit * 0.8 ? "warn" : "ok");

/**
 * Cómo viene cada techo en un mes.
 * `today` (solo en el mes actual) agrega la semana en curso; `pendingFijos` suma lo comprometido.
 */
export function budgetStatus(
  cfg: BudgetConfig,
  items: BudgetItem[],
  month: string,
  opts: { today?: string; pendingFijos?: Recurring[] } = {},
): BudgetStatus {
  const cats = new Set(cfg.category_ids);
  const mineItems = items.filter((i) => i.categoryId && cats.has(i.categoryId));
  const inMonth = mineItems.filter((i) => i.date.startsWith(month));
  const spent = r2(inMonth.reduce((a, i) => a + i.amount, 0));
  const committed = r2((opts.pendingFijos ?? []).filter((r) => r.category_id && cats.has(r.category_id)).reduce((a, r) => a + Number(r.amount), 0));
  const week =
    cfg.weekly && opts.today
      ? (() => {
          const w = weekOf(opts.today);
          return { ...w, spent: r2(mineItems.filter((i) => i.date >= w.from && i.date <= w.to).reduce((a, i) => a + i.amount, 0)) };
        })()
      : null;
  const excesses = mineItems
    .filter((i) => i.event && i.event.date.startsWith(month))
    .map((i) => ({ ...i.event!, reasons: excessReasons(cfg, i.event!) }))
    .filter((e) => e.reasons.length)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { cfg, spent, committed, pct: spent / cfg.monthly, level: levelOf(spent, cfg.monthly), week, excesses };
}

export interface Check {
  cfg: BudgetConfig;
  /** Lo que ya llevás en el mes de ese gasto (sin contar el que estás editando) */
  before: number;
  after: number;
  left: number;
  level: "ok" | "warn" | "over";
  week: { before: number; after: number; limit: number } | null;
  /** Avisos en rojo (piden "Guardar igual") */
  reasons: string[];
  /** Avisos en amarillo (solo informan) */
  warnings: string[];
}

/**
 * Qué pasa con el techo si guardás este gasto.
 * `monthAmount` es lo que suma al mes (en cuotas, la cuota 1); `eventAmount` es el total del pedido o la compra.
 */
export function checkExpense(
  cfg: BudgetConfig,
  items: BudgetItem[],
  input: { date: string; monthAmount: number; eventAmount: number; excludeTxId?: string | null; excludePurchaseId?: string | null },
): Check {
  const cats = new Set(cfg.category_ids);
  const rel = items.filter(
    (i) =>
      i.categoryId &&
      cats.has(i.categoryId) &&
      (!input.excludeTxId || i.txId !== input.excludeTxId) &&
      (!input.excludePurchaseId || i.purchaseId !== input.excludePurchaseId),
  );
  const month = input.date.slice(0, 7);
  const before = r2(rel.filter((i) => i.date.startsWith(month)).reduce((a, i) => a + i.amount, 0));
  const after = r2(before + input.monthAmount);
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (after > cfg.monthly + 0.005) reasons.push(`Te pasás ${money(r2(after - cfg.monthly))} del techo de ${cfg.name}`);
  else if (after >= cfg.monthly * 0.8) warnings.push(`Vas a usar el ${Math.round((after / cfg.monthly) * 100)}% del techo de ${cfg.name}`);

  let week: Check["week"] = null;
  if (cfg.weekly) {
    const w = weekOf(input.date);
    const wb = r2(rel.filter((i) => i.date >= w.from && i.date <= w.to).reduce((a, i) => a + i.amount, 0));
    week = { before: wb, after: r2(wb + input.monthAmount), limit: cfg.weekly };
    if (week.after > cfg.weekly + 0.005) reasons.push(`Te pasás ${money(r2(week.after - cfg.weekly))} del techo semanal de ${cfg.name}`);
    else if (week.after >= cfg.weekly * 0.8) warnings.push(`Vas a usar el ${Math.round((week.after / cfg.weekly) * 100)}% del techo semanal`);
  }
  for (const r of excessReasons(cfg, { date: input.date, amount: input.eventAmount })) {
    reasons.push(r.charAt(0).toUpperCase() + r.slice(1));
  }
  return {
    cfg,
    before,
    after,
    left: r2(cfg.monthly - after),
    level: reasons.length ? "over" : warnings.length ? "warn" : "ok",
    week,
    reasons,
    warnings,
  };
}

/** Fijos activos de un mes que todavía no se generaron (lo comprometido) */
export function pendingFijos(recurring: Recurring[], txs: Transaction[], month: string) {
  const have = new Set(txs.filter((t) => t.period === month && t.recurring_id).map((t) => t.recurring_id));
  return recurring.filter((r) => r.active && r.kind === "expense" && !have.has(r.id));
}

/** Techos que regían en un mes: la foto de ese mes si existe; si no, los actuales */
export function configFor(month: string, current: BudgetConfig[], snapshots: Record<string, BudgetConfig[]>, currentMonth: string) {
  if (month >= currentMonth) return current;
  return snapshots[month] ?? current;
}

/** Forma estable para comparar y guardar la foto mensual */
export const toConfig = (b: BudgetConfig): BudgetConfig => ({
  id: b.id,
  name: b.name,
  monthly: Number(b.monthly),
  weekly: b.weekly == null ? null : Number(b.weekly),
  max_per_tx: b.max_per_tx == null ? null : Number(b.max_per_tx),
  allowed_days: b.allowed_days?.length ? [...b.allowed_days].map(Number).sort() : null,
  category_ids: [...b.category_ids].sort(),
});
