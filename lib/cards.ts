import type { Card, Purchase, Transaction } from "./types";
import { addMonths, currentMonth, dueDate, todayISO, uid } from "./format";

const cents = (n: number) => Math.round(n * 100);

/** Divide un total en N cuotas en centavos; la diferencia de redondeo va a la última. */
export function installmentAmounts(total: number, n: number) {
  const base = Math.floor(cents(total) / n);
  const last = cents(total) - base * (n - 1);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? last : base) / 100);
}

/** Mes del próximo pago de la tarjeta: este mes si todavía no pasó el día de pago, si no el siguiente. */
export function nextPaymentPeriod(card: Pick<Card, "due_day">, today = todayISO()) {
  const ym = currentMonth();
  return dueDate(ym, card.due_day) >= today ? ym : addMonths(ym, 1);
}

/** Genera los movimientos (uno por cuota) de una compra con tarjeta. */
export function buildInstallments(p: Purchase, card: Card, myRatio: number | null): Transaction[] {
  const amounts = installmentAmounts(p.total_amount, p.installments);
  const rows: Transaction[] = [];
  for (let k = Math.max(1, p.from_installment); k <= p.installments; k++) {
    const period = addMonths(p.first_period, k - 1);
    const amount = amounts[k - 1];
    rows.push({
      id: uid(),
      kind: "expense",
      amount,
      category_id: p.category_id,
      note: p.description,
      occurred_on: dueDate(period, card.due_day),
      recurring_id: null,
      period: null,
      card_id: card.id,
      purchase_id: p.id,
      installment: p.installments > 1 ? k : null,
      my_share: myRatio === null ? null : Math.round(amount * myRatio * 100) / 100,
    });
  }
  return rows;
}

/** Cuotas que faltan pagar y cuánto suman, a partir de un mes dado. */
export function remaining(p: Purchase, fromPeriod: string) {
  const amounts = installmentAmounts(p.total_amount, p.installments);
  let count = 0;
  let total = 0;
  for (let k = Math.max(1, p.from_installment); k <= p.installments; k++) {
    if (addMonths(p.first_period, k - 1) >= fromPeriod) {
      count++;
      total += amounts[k - 1];
    }
  }
  return { count, total: Math.round(total * 100) / 100 };
}

/** Cuota que corresponde a un mes (o null si ese mes no tiene cuota). */
export function installmentFor(p: Purchase, period: string) {
  for (let k = Math.max(1, p.from_installment); k <= p.installments; k++) {
    if (addMonths(p.first_period, k - 1) === period) return k;
  }
  return null;
}

export const CARD_COLORS = ["#7c5cff", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#111827", "#64748b"];
