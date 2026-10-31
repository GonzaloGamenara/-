import { toISO } from "./format";
import type { Asset, Card, Recurring, Transaction } from "./types";

/**
 * Cuadrar patrimonio con gastos (etapa 1): cada movimiento sale de una cuenta y el saldo
 * se estima solo = último saldo que confirmaste + ingresos − gastos − débitos de tarjeta desde entonces.
 */

/** Lo mínimo de un movimiento para mover saldos */
export type FlowTx = Pick<Transaction, "kind" | "amount" | "occurred_on"> & {
  account_id?: string | null;
  card_id?: string | null;
  created_at?: string | null;
};

export interface Estimate {
  /** Saldo estimado hoy */
  value: number;
  /** Saldo confirmado y desde cuándo */
  base: number;
  since: string | null;
  /** Lo que entró y salió desde la confirmación */
  income: number;
  expense: number;
  /** Resúmenes de tarjeta debitados desde la confirmación */
  cards: number;
  count: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La cuenta principal: la marcada o, si no hay, la primera */
export function defaultAccountId(accounts: Pick<Asset, "id" | "kind" | "is_default" | "sort">[]) {
  const cuentas = accounts.filter((a) => a.kind === "cuenta");
  return (cuentas.find((a) => a.is_default) ?? [...cuentas].sort((a, b) => a.sort - b.sort)[0])?.id ?? null;
}

/** A qué cuenta va un movimiento: las compras con tarjeta, a la cuenta de la tarjeta (el día del débito) */
export function accountOf(t: FlowTx, cards: Pick<Card, "id" | "account_id">[], defaultId: string | null) {
  if (t.card_id) return cards.find((c) => c.id === t.card_id)?.account_id ?? defaultId;
  return t.account_id ?? defaultId;
}

/**
 * ¿El movimiento pasó después de confirmar el saldo? Los de días posteriores, sí. Los del mismo día,
 * solo si los cargaste después de confirmar (lo anterior ya estaba en el saldo del banco).
 */
export function afterAnchor(t: FlowTx, balanceAt: string | null, today: string) {
  if (t.occurred_on > today) return false; // fijos o cuotas que todavía no pasaron
  if (!balanceAt) return false;
  const day = toISO(new Date(balanceAt));
  if (t.occurred_on > day) return true;
  if (t.occurred_on < day) return false;
  return !!t.created_at && t.created_at > balanceAt;
}

export function estimateBalance(
  a: Pick<Asset, "id" | "balance" | "balance_at">,
  txs: FlowTx[],
  cards: Pick<Card, "id" | "account_id">[],
  defaultId: string | null,
  today: string,
): Estimate {
  const base = Number(a.balance ?? 0);
  let income = 0;
  let expense = 0;
  let cardsOut = 0;
  let count = 0;
  for (const t of txs) {
    if (accountOf(t, cards, defaultId) !== a.id || !afterAnchor(t, a.balance_at ?? null, today)) continue;
    // Lo que salió de tu cuenta es el total, aunque después otros te devuelvan su parte
    const amt = Number(t.amount);
    if (t.kind === "income") income += amt;
    else if (t.card_id) cardsOut += amt;
    else expense += amt;
    count++;
  }
  return { value: r2(base + income - expense - cardsOut), base, since: a.balance_at ?? null, income: r2(income), expense: r2(expense), cards: r2(cardsOut), count };
}

/** Fijos (gastos sin tarjeta) que faltan este mes: se generan solos el día que vencen, así que son los de días que no llegaron */
export function pendingFijos(recurring: Recurring[], today: string, dueDate: (ym: string, d: number) => string) {
  const ym = today.slice(0, 7);
  return r2(
    recurring
      .filter((r) => r.kind === "expense" && r.active && !r.card_id && dueDate(ym, r.day) > today)
      .reduce((s, r) => s + Number(r.amount), 0),
  );
}

export type Bucket = "disponible" | "invertido" | "deuda";

/** Disponible hoy: cuentas con saldo y fondos de uso inmediato. Deuda: cuentas en rojo. El resto, invertido. */
export function bucketOf(a: Pick<Asset, "kind" | "liquid">, value: number | null): Bucket {
  if (a.kind === "cuenta") return (value ?? 0) < 0 ? "deuda" : "disponible";
  if (a.kind !== "cedear" && a.liquid) return "disponible";
  return "invertido";
}
