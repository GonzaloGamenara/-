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

export function monthStats(
  month: string,
  txs: Transaction[],
  prevTxs: Transaction[],
  cats: Category[],
  recurring: Recurring[],
) {
  const expenses = txs.filter((t) => t.kind === "expense");
  const incomes = txs.filter((t) => t.kind === "income");
  const spent = sum(expenses);
  const earned = sum(incomes);
  const prevSpent = sum(prevTxs.filter((t) => t.kind === "expense"));

  const isCurrent = month === currentMonth();
  const today = todayISO();
  const dim = daysInMonth(month);
  const elapsed = isCurrent ? Number(today.slice(8, 10)) : month < currentMonth() ? dim : 0;

  // Gasto variable = lo que no viene de un fijo. Sirve para proyectar el ritmo diario.
  const fixedSpent = sum(expenses.filter((t) => t.recurring_id));
  const variableSpent = spent - fixedSpent;

  // Fijos que todavía no cayeron este mes
  const applied = new Set(txs.filter((t) => t.period === month).map((t) => t.recurring_id));
  const upcoming = isCurrent
    ? recurring.filter((r) => r.active && !applied.has(r.id) && dueDate(month, r.day) > today)
    : [];
  const upcomingExpense = upcoming.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amount, 0);
  const upcomingIncome = upcoming.filter((r) => r.kind === "income").reduce((a, r) => a + r.amount, 0);

  const dailyAvg = elapsed > 0 ? variableSpent / elapsed : 0;
  const projected = isCurrent ? spent + upcomingExpense + dailyAvg * (dim - elapsed) : spent;

  const perDay = Array.from({ length: dim }, () => 0);
  for (const t of expenses) perDay[Number(t.occurred_on.slice(8, 10)) - 1] += mine(t);

  return {
    spent,
    earned,
    balance: earned - spent,
    prevSpent,
    deltaVsPrev: prevSpent > 0 ? (spent - prevSpent) / prevSpent : null,
    fixedSpent,
    variableSpent,
    dailyAvg,
    projected,
    upcoming,
    upcomingExpense,
    upcomingIncome,
    cardSpent: sum(expenses.filter((t) => t.card_id)),
    elapsed,
    dim,
    perDay,
    isCurrent,
    expenseCats: byCategory(expenses, cats),
    incomeCats: byCategory(incomes, cats),
    savingsRate: earned > 0 ? (earned - spent) / earned : null,
  };
}
