"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { currentMonth, todayISO, uid } from "./format";
import type { Asset, AssetKind, AssetSnapshot } from "./types";
import type { Quote } from "./preciosFuente";

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
}

const PRICES_KEY = "gastos:precios";
const r2 = (n: number) => Math.round(n * 100) / 100;
const daysSince = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Qué vale cada cosa hoy, en pesos */
export function valueAsset(a: Asset, prices: Prices): ValuedAsset {
  const toArs = (n: number) => (a.currency === "USD" ? (prices.mep ? n * prices.mep : null) : n);
  if (a.kind === "cedear") {
    const q = a.ticker ? prices.quotes[a.ticker.toUpperCase()] : undefined;
    const price = q?.price ?? (a.last_price != null ? Number(a.last_price) : null);
    const qty = Number(a.quantity ?? 0);
    return { asset: a, value: price != null ? r2(qty * price) : null, price, live: !!q, change: q?.change ?? null, accrued: 0 };
  }
  const base = Number(a.balance ?? 0);
  const accrued = a.kind === "fondo" && a.rate ? r2(base * (Number(a.rate) / 100) * (daysSince(a.updated_at) / 365)) : 0;
  return { asset: a, value: toArs(base + accrued), price: null, live: false, change: null, accrued };
}

export function totals(rows: ValuedAsset[], cardDebt: number) {
  const sum = (f: (r: ValuedAsset) => boolean) => r2(rows.filter(f).reduce((a, r) => a + (r.value ?? 0), 0));
  const cash = sum((r) => r.asset.kind === "cuenta");
  const invested = sum((r) => r.asset.kind !== "cuenta");
  return { cash, invested, total: r2(cash + invested), net: r2(cash + invested - cardDebt) };
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

/** Todo lo necesario para valuar el patrimonio (también lo usan el export y el asesor) */
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
  const snapshots = ((snapsRes.data ?? []) as AssetSnapshot[]).map((s) => ({ ...s, total: Number(s.total), cash: Number(s.cash), invested: Number(s.invested) }));
  // Compras con tarjeta que todavía no pagaste (cuotas y resúmenes futuros)
  const cardDebt = r2(((debtRes.data ?? []) as { amount: number }[]).reduce((a, t) => a + Number(t.amount), 0));
  const p = prices ?? cachedPrices();
  const rows = assets.map((a) => valueAsset(a, p));
  return { missing: false as const, assets, snapshots, cardDebt, prices: p, rows, ...totals(rows, cardDebt) };
}

export type AssetInput = Partial<Asset> & Pick<Asset, "name" | "kind">;

/** Hook de la pantalla de patrimonio */
export function usePatrimonio() {
  const [assets, setAssets] = useState<Asset[]>([]);
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

  const rows = useMemo(() => assets.map((a) => valueAsset(a, prices)), [assets, prices]);

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
  const t = useMemo(() => totals(rows, cardDebt), [rows, cardDebt]);

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
      };
      const id = input.id ?? uid();
      const { error: err } = input.id
        ? await db.from("assets").update(body).eq("id", id)
        : await db.from("assets").insert({ id, ...body, sort: assets.length });
      if (err) return err.message;
      setAssets((prev) =>
        input.id
          ? prev.map((a) => (a.id === id ? { ...a, ...body } : a))
          : [...prev, { id, ...body, sort: prev.length } as Asset],
      );
      return null;
    },
    [assets.length],
  );

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase().from("assets").delete().eq("id", id);
    if (err) return err.message;
    setAssets((prev) => prev.filter((a) => a.id !== id));
    return null;
  }, []);

  return { assets, rows, snapshots, cardDebt, prices, loading, missing, error, refreshing, refreshPrices, save, remove, reload: load, ...t };
}
