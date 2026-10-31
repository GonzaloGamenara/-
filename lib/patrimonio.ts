"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { currentMonth, toISO, todayISO, uid } from "./format";
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

function cachedPrices(): Prices {
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
export async function loadPatrimonio(prices?: Prices) {
  const db = supabase();
  const today = todayISO();
  const [assetsRes, snapsRes, debtRes] = await Promise.all([
    db.from("assets").select("*").order("sort").order("created_at"),
    db.from("asset_snapshots").select("period,total,cash,invested,mep").order("period"),
    db.from("transactions").select("amount").not("card_id", "is", null).gt("occurred_on", today),
  ]);
  if (isMissing(assetsRes.error)) return { missing: true as const };
  if (assetsRes.error) throw assetsRes.error;
  const assets = (assetsRes.data ?? []) as Asset[];
  const flows = await loadFlows(assets);
  const snapshots = ((snapsRes.data ?? []) as AssetSnapshot[]).map((s) => ({ ...s, total: Number(s.total), cash: Number(s.cash), invested: Number(s.invested) }));
  // Compras con tarjeta que todavía no pagaste (cuotas y resúmenes futuros)
  const cardDebt = r2(((debtRes.data ?? []) as { amount: number }[]).reduce((a, t) => a + Number(t.amount), 0));
  const p = prices ?? cachedPrices();
  const rows = assets.map((a) => valueAsset(a, p, flows));
  return { missing: false as const, assets, snapshots, cardDebt, flows, prices: p, rows, ...totals(rows, cardDebt) };
}

/** Movimientos desde el saldo confirmado más viejo (null si falta la migración 008) */
export async function loadFlows(assets: Asset[]): Promise<Flows | null> {
  const cuentas = assets.filter((a) => a.kind === "cuenta");
  if (!cuentas.length || !("balance_at" in cuentas[0])) return null;
  const anchors = cuentas.map((a) => a.balance_at).filter((x): x is string => !!x);
  if (!anchors.length) return { txs: [], cards: [], defaultId: defaultAccountId(assets) };
  const since = toISO(new Date(anchors.sort()[0]));
  const db = supabase();
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

/**
 * Hook de la pantalla de patrimonio. `accountsReady`: la migración 008 está corrida (saldos estimados,
 * cuenta principal y fondos disponibles). `pendingFijos`: gastos fijos que faltan este mes.
 */
export function usePatrimonio({ accountsReady = false, pendingFijos = 0 }: { accountsReady?: boolean; pendingFijos?: number } = {}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [flows, setFlows] = useState<Flows | null>(null);
  const [snapshots, setSnapshots] = useState<AssetSnapshot[]>([]);
  const [cardDebt, setCardDebt] = useState(0);
  const [prices, setPrices] = useState<Prices>({ quotes: {}, mep: null, at: null });
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await loadPatrimonio();
      if (r.missing) return setMissing(true);
      setAssets(r.assets);
      setFlows(r.flows);
      setSnapshots(r.snapshots);
      setCardDebt(r.cardDebt);
      setPrices(r.prices);
      setError(null);
    } catch (e) {
      setError((e as Error)?.message ?? "No pude cargar tu patrimonio");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPrices = useCallback(async () => {
    setRefreshing(true);
    const p = await fetchPrices();
    if (p) setPrices(p);
    setRefreshing(false);
    return !!p;
  }, []);

  useEffect(() => {
    load();
    refreshPrices();
  }, [load, refreshPrices]);

  const rows = useMemo(() => assets.map((a) => valueAsset(a, prices, flows)), [assets, prices, flows]);

  // Guardamos la cotización nueva como "último precio": si mañana la fuente falla, se usa esa
  useEffect(() => {
    if (!prices.at) return;
    const stale = assets.filter((a) => {
      const q = a.kind === "cedear" && a.ticker ? prices.quotes[a.ticker.toUpperCase()] : undefined;
      return q && (a.last_price == null || Math.abs(q.price - Number(a.last_price)) > 0.005);
    });
    if (!stale.length) return;
    const db = supabase();
    for (const a of stale) {
      const price = prices.quotes[a.ticker!.toUpperCase()].price;
      db.from("assets").update({ last_price: price, price_at: prices.at }).eq("id", a.id).then(({ error: err }) => {
        if (!err) setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, last_price: price, price_at: prices.at } : x)));
      });
    }
  }, [prices, assets]);
  const t = useMemo(() => totals(rows, cardDebt, pendingFijos), [rows, cardDebt, pendingFijos]);

  // Foto del mes: se actualiza sola cuando cambia el total (alimenta el gráfico de evolución)
  const lastSaved = useRef<string>("");
  useEffect(() => {
    if (loading || missing || !assets.length) return;
    const period = currentMonth();
    const body = { period, total: t.total, cash: t.cash, invested: t.invested, mep: prices.mep };
    const key = JSON.stringify(body);
    if (key === lastSaved.current) return;
    const timer = setTimeout(async () => {
      lastSaved.current = key;
      const detail = rows.map((r) => ({ name: r.asset.name, kind: r.asset.kind, value: r.value }));
      const { error: err } = await supabase().from("asset_snapshots").upsert({ ...body, detail }, { onConflict: "user_id,period" });
      if (!err) setSnapshots((prev) => [...prev.filter((s) => s.period !== period), body].sort((a, b) => a.period.localeCompare(b.period)));
    }, 1200);
    return () => clearTimeout(timer);
  }, [loading, missing, assets.length, t, prices.mep, rows]);

  const save = useCallback(
    async (input: AssetInput) => {
      const db = supabase();
      const now = new Date().toISOString();
      const body = {
        name: input.name.trim(),
        kind: input.kind,
        ticker: input.kind === "cedear" ? (input.ticker ?? "").trim().toUpperCase() || null : null,
        quantity: input.kind === "cedear" ? (input.quantity ?? 0) : null,
        balance: input.kind === "cedear" ? null : (input.balance ?? 0),
        currency: input.kind === "cedear" ? "ARS" : (input.currency ?? "ARS"),
        last_price: input.kind === "cedear" ? (input.last_price ?? null) : null,
        price_at: input.kind === "cedear" && input.last_price != null ? (input.price_at ?? now) : null,
        rate: input.kind === "fondo" ? (input.rate ?? null) : null,
        broker: input.broker?.trim() || null,
        updated_at: now,
        // Guardar una cuenta es confirmar su saldo: desde ahora se suman y restan los movimientos
        ...(accountsReady
          ? {
              balance_at: input.kind === "cuenta" ? now : null,
              is_default: input.kind === "cuenta" ? !!input.is_default : false,
              liquid: input.kind === "fondo" || input.kind === "otro" ? !!input.liquid : false,
            }
          : {}),
      };
      const id = input.id ?? uid();
      const { error: err } = input.id
        ? await db.from("assets").update(body).eq("id", id)
        : await db.from("assets").insert({ id, ...body, sort: assets.length });
      if (err) return err.message;
      // Una sola cuenta principal
      if (accountsReady && input.kind === "cuenta" && input.is_default) {
        await db.from("assets").update({ is_default: false }).eq("kind", "cuenta").neq("id", id);
      }
      setAssets((prev) => {
        const next = input.id ? prev.map((a) => (a.id === id ? { ...a, ...body } : a)) : [...prev, { id, ...body, sort: prev.length } as Asset];
        return accountsReady && input.kind === "cuenta" && input.is_default ? next.map((a) => (a.id === id || a.kind !== "cuenta" ? a : { ...a, is_default: false })) : next;
      });
      if (accountsReady && input.kind === "cuenta") load();
      return null;
    },
    [assets.length, accountsReady, load],
  );

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase().from("assets").delete().eq("id", id);
    if (err) return err.message;
    setAssets((prev) => prev.filter((a) => a.id !== id));
    return null;
  }, []);

  return { assets, rows, snapshots, cardDebt, flows, prices, loading, missing, error, refreshing, refreshPrices, save, remove, reload: load, ...t };
}
