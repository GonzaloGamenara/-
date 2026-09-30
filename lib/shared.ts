/** Cuentas compartidas: cálculo de partes, saldos y transferencias mínimas. */

export interface SharedGroup {
  id: string;
  name: string;
  category_id: string | null;
  occurred_on: string;
  transaction_id: string | null;
  /** Código del link público (null = no compartida) */
  share_token?: string | null;
}
export interface SharedMember {
  id: string;
  group_id: string;
  name: string;
  is_me: boolean;
}
export interface SharedExpense {
  id: string;
  group_id: string;
  payer_id: string;
  amount: number;
  description: string | null;
  among: string[] | null;
}
export interface SharedPayment {
  id: string;
  group_id: string;
  from_id: string;
  to_id: string;
  amount: number;
  paid_on: string;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cuánto le toca a cada miembro de un gasto (en centavos exactos; el resto al primero). */
export function sharesOf(e: SharedExpense, memberIds: string[]) {
  const among = (e.among?.length ? e.among : memberIds).filter((id) => memberIds.includes(id));
  const out = new Map<string, number>();
  if (!among.length) return out;
  const cents = Math.round(e.amount * 100);
  const base = Math.floor(cents / among.length);
  let rest = cents - base * among.length;
  for (const id of among) {
    out.set(id, (base + (rest > 0 ? 1 : 0)) / 100);
    if (rest > 0) rest--;
  }
  return out;
}

export function groupBalances(members: SharedMember[], expenses: SharedExpense[], payments: SharedPayment[]) {
  const ids = members.map((m) => m.id);
  const paid = new Map(ids.map((id) => [id, 0]));
  const consumed = new Map(ids.map((id) => [id, 0]));
  for (const e of expenses) {
    paid.set(e.payer_id, (paid.get(e.payer_id) ?? 0) + e.amount);
    for (const [id, s] of sharesOf(e, ids)) consumed.set(id, (consumed.get(id) ?? 0) + s);
  }
  // Saldo: positivo = le deben; negativo = debe
  const net = new Map(ids.map((id) => [id, r2((paid.get(id) ?? 0) - (consumed.get(id) ?? 0))]));
  for (const p of payments) {
    net.set(p.from_id, r2((net.get(p.from_id) ?? 0) + p.amount));
    net.set(p.to_id, r2((net.get(p.to_id) ?? 0) - p.amount));
  }
  const total = r2(expenses.reduce((a, e) => a + e.amount, 0));
  return { paid, consumed, net, total, transfers: minimalTransfers(net) };
}

/** Menor cantidad de transferencias para saldar todo (deudor más grande → acreedor más grande). */
export function minimalTransfers(net: Map<string, number>): Transfer[] {
  const debt = [...net].filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v }));
  const cred = [...net].filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v }));
  debt.sort((a, b) => b.v - a.v);
  cred.sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = r2(Math.min(debt[i].v, cred[j].v));
    if (amt >= 1) out.push({ from: debt[i].id, to: cred[j].id, amount: amt });
    debt[i].v = r2(debt[i].v - amt);
    cred[j].v = r2(cred[j].v - amt);
    if (debt[i].v < 0.5) i++;
    if (cred[j].v < 0.5) j++;
  }
  return out;
}
