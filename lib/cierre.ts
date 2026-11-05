import type { BudgetItem } from "./techos";
import { mine, type Category, type Purchase, type Transaction } from "./types";

/**
 * Cierre de mes: cómo te fue en un mes ya terminado.
 * Ingresos, gastos y ahorro van como en Inicio (las tarjetas, cuando se pagan); los gastos más grandes,
 * como en los techos (las compras con tarjeta, en el mes en que compraste).
 */

export interface CierreCategoria {
  id: string | null;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  /** Lo del mes anterior (null si no hay mes anterior comparable) */
  prev: number | null;
}

export interface CierreTop {
  label: string;
  amount: number;
  date: string;
  categoryId: string | null;
}

export interface Cierre {
  mes: string;
  earned: number;
  spent: number;
  saved: number;
  /** Ahorro sobre lo que entró (null si no entró nada) */
  rate: number | null;
  prev: { earned: number; spent: number; saved: number; rate: number | null } | null;
  /** Variación de los gastos contra el mes anterior, en % (null si no hay comparable) */
  spentDelta: number | null;
  categories: CierreCategoria[];
  top: CierreTop[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function totals(txs: Transaction[]) {
  const earned = r2(txs.filter((t) => t.kind === "income").reduce((a, t) => a + Number(t.amount), 0));
  const spent = r2(txs.filter((t) => t.kind === "expense").reduce((a, t) => a + mine(t), 0));
  return { earned, spent, saved: r2(earned - spent), rate: earned > 0 ? (earned - spent) / earned : null };
}

export function buildCierre(opts: {
  mes: string;
  txs: Transaction[];
  prevTxs: Transaction[] | null;
  items: BudgetItem[];
  categories: Category[];
  purchases: Purchase[];
}): Cierre {
  const { mes, txs, prevTxs, items, categories, purchases } = opts;
  const cur = totals(txs);
  const prev = prevTxs ? totals(prevTxs) : null;

  const byCat = (list: Transaction[]) => {
    const m = new Map<string | null, number>();
    for (const t of list) if (t.kind === "expense") m.set(t.category_id, (m.get(t.category_id) ?? 0) + mine(t));
    return m;
  };
  const now = byCat(txs);
  const before = prevTxs ? byCat(prevTxs) : null;
  const cat = (id: string | null) => categories.find((c) => c.id === id);
  const cats: CierreCategoria[] = [...now.entries()]
    .map(([id, amount]) => ({
      id,
      name: cat(id)?.name ?? "Sin categoría",
      emoji: cat(id)?.emoji ?? "🏷️",
      color: cat(id)?.color ?? "#64748b",
      amount: r2(amount),
      prev: before ? r2(before.get(id) ?? 0) : null,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Los más grandes del mes, con las compras con tarjeta en el mes en que compraste (sin los fijos: ya los conocés)
  const note = new Map(txs.map((t) => [t.id, t.note]));
  const fijos = new Set(txs.filter((t) => t.recurring_id).map((t) => t.id));
  const desc = new Map(purchases.map((p) => [p.id, p.description]));
  const top = items
    .filter((i) => i.date.startsWith(mes) && i.amount > 0 && !(i.txId && fijos.has(i.txId)))
    .map((i) => ({
      label: i.event?.label || (i.txId ? note.get(i.txId) : null) || (i.purchaseId ? desc.get(i.purchaseId) : null) || cat(i.categoryId)?.name || "Gasto",
      amount: i.amount,
      date: i.date,
      categoryId: i.categoryId,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    mes,
    ...cur,
    prev,
    spentDelta: prev && prev.spent > 0 ? ((cur.spent - prev.spent) / prev.spent) * 100 : null,
    categories: cats,
    top,
  };
}
