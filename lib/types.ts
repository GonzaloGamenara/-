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
  /** De qué cuenta se paga (o a cuál entra); vacío = la principal */
  account_id?: string | null;
  /** Se cobra el último día hábil del mes (ej: el sueldo); en ese caso `day` queda en 31 */
  last_business_day?: boolean;
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
  /** De qué cuenta salió o a cuál entró (vacío = la principal) */
  account_id?: string | null;
  created_at?: string;
  /** Solo en cliente: todavía no se sincronizó con Supabase */
  pending?: boolean;
}

export interface Card {
  id: string;
  name: string;
  color: string;
  due_day: number;
  /** Día de cierre del resumen (opcional): las compras posteriores van al resumen siguiente */
  closing_day?: number | null;
  /** De qué cuenta se debita el resumen (vacío = la principal) */
  account_id?: string | null;
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

export type AssetKind = "cuenta" | "cedear" | "fondo" | "otro";

/** Algo que tenés: una cuenta, un CEDEAR/acción, un fondo u otra inversión */
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  ticker: string | null;
  quantity: number | null;
  balance: number | null;
  currency: "ARS" | "USD";
  last_price: number | null;
  price_at: string | null;
  /** Fondos: TNA estimada en % para proyectar el valor entre actualizaciones */
  rate: number | null;
  broker: string | null;
  sort: number;
  updated_at: string;
  /** Cuentas: cuándo confirmaste el saldo (desde ahí se suman y restan los movimientos) */
  balance_at?: string | null;
  /** La cuenta principal: de ahí salen los movimientos por defecto */
  is_default?: boolean;
  /** Fondos u otros que se pueden usar en el día (cuentan como disponible) */
  liquid?: boolean;
}

export interface AssetSnapshot {
  period: string; // YYYY-MM
  total: number;
  cash: number;
  invested: number;
  mep: number | null;
}
