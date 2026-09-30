export type Kind = "expense" | "income";

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
  sort: number;
}

export interface Recurring {
  id: string;
  kind: Kind;
  name: string;
  amount: number;
  category_id: string | null;
  day: number;
  active: boolean;
  /** Si es una suscripción pagada con tarjeta */
  card_id?: string | null;
  created_at?: string;
}

export interface Transaction {
  id: string;
  kind: Kind;
  amount: number;
  category_id: string | null;
  note: string | null;
  occurred_on: string; // YYYY-MM-DD
  recurring_id: string | null;
  period: string | null;
  card_id?: string | null;
  purchase_id?: string | null;
  installment?: number | null;
  /** Si está dividido: lo que te toca a vos */
  my_share?: number | null;
  /** Solo en cliente: todavía no se sincronizó con Supabase */
  pending?: boolean;
}

export interface Card {
  id: string;
  name: string;
  color: string;
  due_day: number;
}

export interface Purchase {
  id: string;
  card_id: string | null;
  description: string;
  category_id: string | null;
  total_amount: number;
  installments: number;
  first_period: string; // YYYY-MM de la cuota 1
  from_installment: number;
  purchased_on: string;
}

export interface Split {
  id: string;
  transaction_id: string | null;
  purchase_id: string | null;
  name: string;
  amount: number;
  settled_on: string | null;
}

/** Monto que cuenta para tus métricas: tu parte si el gasto está dividido */
export const mine = (t: Pick<Transaction, "amount" | "my_share">) =>
  t.my_share === null || t.my_share === undefined ? t.amount : Number(t.my_share);
