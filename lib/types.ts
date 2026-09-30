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
  /** Solo en cliente: todavía no se sincronizó con Supabase */
  pending?: boolean;
}
