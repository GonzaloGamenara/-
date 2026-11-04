/**
 * Patrimonio: valuación de cuentas e inversiones. Sin React, así lo puede usar también el servidor
 * (la API para tu agente de IA). El hook de la pantalla vive en patrimonio.ts.
 */
import { supabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toISO, todayISO } from "./format";
import type { Asset, AssetKind, AssetSnapshot, Card } from "./types";
import type { Quote } from "./preciosFuente";
import { bucketOf, defaultAccountId, estimateBalance, type Bucket, type Estimate, type FlowTx } from "./cuentas";

export const KIND_LABEL: Record<AssetKind, string> = {
  cuenta: "Cuenta",
  cedear: "CEDEAR / acción",
  fondo: "Fondo",
  otro: "Otro",
};
export const KIND_EMOJI: Record<AssetKind, string> = { cuenta: "🏦", cedear: "📈", fondo: "🪙", otro: "💼" };

export interface Prices {
  quotes: Record<string, Quote>;
  mep: number | null;
  at: string | null;
}

export interface ValuedAsset {
  asset: Asset;
  /** Valor en pesos (null si es en dólares y no hay cotización) */
  value: number | null;
  /** CEDEARs: precio por nominal usado y de dónde salió */
  price: number | null;
  live: boolean;
  change: number | null;
  /** Fondos con TNA: cuánto se estimó de rendimiento desde la última actualización */
  accrued: number;
  /** Cuentas: saldo estimado con los movimientos desde que lo confirmaste */
  estimate: Estimate | null;
  bucket: Bucket;
}

const PRICES_KEY = "gastos:precios";
const r2 = (n: number) => Math.round(n * 100) / 100;
const daysSince = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Movimientos y tarjetas para estimar los saldos de las cuentas (vacío si falta la migración 008) */
export interface Flows {
  txs: FlowTx[];
  cards: Pick<Card, "id" | "account_id">[];
  defaultId: string | null;
}

/** Qué vale cada cosa hoy, en pesos */
export function valueAsset(a: Asset, prices: Prices, flows?: Flows | null): ValuedAsset {
  const toArs = (n: number) => (a.currency === "USD" ? (prices.mep ? n * prices.mep : null) : n);
  const done = (v: Omit<ValuedAsset, "bucket">): ValuedAsset => ({ ...v, bucket: bucketOf(a, v.value) });
  if (a.kind === "cedear") {
    const q = a.ticker ? prices.quotes[a.ticker.toUpperCase()] : undefined;
    const price = q?.price ?? (a.last_price != null ? Number(a.last_price) : null);
    const qty = Number(a.quantity ?? 0);
    return done({ asset: a, value: price != null ? r2(qty * price) : null, price, live: !!q, change: q?.change ?? null, accrued: 0, estimate: null });
  }
  // Cuentas en pesos: el saldo se mueve solo con lo que cargás
  if (a.kind === "cuenta" && a.currency !== "USD" && flows && a.balance_at) {
    const est = estimateBalance(a, flows.txs, flows.cards, flows.defaultId, todayISO());
    return done({ asset: a, value: est.value, price: null, live: false, change: null, accrued: 0, estimate: est });
  }
  const base = Number(a.balance ?? 0);
  const accrued = a.kind === "fondo" && a.rate ? r2(base * (Number(a.rate) / 100) * (daysSince(a.updated_at) / 365)) : 0;
  return done({ asset: a, value: toArs(base + accrued), price: null, live: false, change: null, accrued, estimate: null });
}

export function totals(rows: ValuedAsset[], cardDebt: number, pendingFijos = 0) {
  const sum = (f: (r: ValuedAsset) => boolean) => r2(rows.filter(f).reduce((a, r) => a + (r.value ?? 0), 0));
  const disponible = sum((r) => r.bucket === "disponible");
  const invested = sum((r) => r.bucket === "invertido");
  // Cuentas en rojo (descubierto): se muestran como deuda
  const owedAccounts = -sum((r) => r.bucket === "deuda");
  const cash = r2(disponible - owedAccounts);
  const debts = r2(owedAccounts + cardDebt);
  return {
    cash,
    invested,
    total: r2(cash + invested),
    net: r2(cash + invested - cardDebt),
    disponible,
    debts,
    owedAccounts,
    /** Lo que podés usar de verdad: disponible − deudas − fijos que faltan este mes */
    disponibleReal: r2(disponible - debts - pendingFijos),
  };
}

export function cachedPrices(): Prices {
  try {
    const raw = localStorage.getItem(PRICES_KEY);
    if (raw) return JSON.parse(raw) as Prices;
  } catch {
    /* sin storage: arrancamos sin precios */
  }
  return { quotes: {}, mep: null, at: null };
}

export async function fetchPrices(): Promise<Prices | null> {
  try {
    const res = await fetch("/api/precios");
    if (!res.ok) return null;
    const j = (await res.json()) as Prices;
    const prev = cachedPrices();
    // Si una fuente falló, conservamos lo último que sí llegó
    const merged: Prices = { quotes: { ...prev.quotes, ...j.quotes }, mep: j.mep ?? prev.mep, at: Object.keys(j.quotes ?? {}).length ? j.at : prev.at };
    try {
      localStorage.setItem(PRICES_KEY, JSON.stringify(merged));
    } catch {
      /* no es crítico */
    }
    return merged;
  } catch {
    return null;
  }
}

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message ?? ""));

/** Todo lo necesario para valuar el patrimonio (también lo usa el export) */
export async function loadPatrimonio(prices?: Prices, db: SupabaseClient = supabase()) {
  const today = todayISO();
  const [assetsRes, snapsRes, debtRes] = await Promise.all([
    db.from("assets").select("*").order("sort").order("created_at"),
    db.from("asset_snapshots").select("period,total,cash,invested,mep").order("period"),
    db.from("transactions").select("amount").not("card_id", "is", null).gt("occurred_on", today),
  ]);
  if (isMissing(assetsRes.error)) return { missing: true as const };
  if (assetsRes.error) throw assetsRes.error;
  const assets = (assetsRes.data ?? []) as Asset[];
  const flows = await loadFlows(assets, db);
  const snapshots = ((snapsRes.data ?? []) as AssetSnapshot[]).map((s) => ({ ...s, total: Number(s.total), cash: Number(s.cash), invested: Number(s.invested) }));
  // Compras con tarjeta que todavía no pagaste (cuotas y resúmenes futuros)
  const cardDebt = r2(((debtRes.data ?? []) as { amount: number }[]).reduce((a, t) => a + Number(t.amount), 0));
  const p = prices ?? cachedPrices();
  const rows = assets.map((a) => valueAsset(a, p, flows));
  return { missing: false as const, assets, snapshots, cardDebt, flows, prices: p, rows, ...totals(rows, cardDebt) };
}

/** Movimientos desde el saldo confirmado más viejo (null si falta la migración 008) */
export async function loadFlows(assets: Asset[], db: SupabaseClient = supabase()): Promise<Flows | null> {
  const cuentas = assets.filter((a) => a.kind === "cuenta");
  if (!cuentas.length || !("balance_at" in cuentas[0])) return null;
  const anchors = cuentas.map((a) => a.balance_at).filter((x): x is string => !!x);
  if (!anchors.length) return { txs: [], cards: [], defaultId: defaultAccountId(assets) };
  const since = toISO(new Date(anchors.sort()[0]));
  const [txRes, cardsRes] = await Promise.all([
    db.from("transactions").select("kind,amount,account_id,card_id,occurred_on,created_at").gte("occurred_on", since).limit(10000),
    db.from("cards").select("id,account_id"),
  ]);
  if (txRes.error || cardsRes.error) return null;
  return {
    txs: ((txRes.data ?? []) as FlowTx[]).map((t) => ({ ...t, amount: Number(t.amount) })),
    cards: (cardsRes.data ?? []) as Pick<Card, "id" | "account_id">[],
    defaultId: defaultAccountId(assets),
  };
}

export type AssetInput = Partial<Asset> & Pick<Asset, "name" | "kind">;
