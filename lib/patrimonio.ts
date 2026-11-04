"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { currentMonth, uid } from "./format";
import type { Asset, AssetSnapshot } from "./types";
import { fetchPrices, loadPatrimonio, totals, valueAsset, type AssetInput, type Flows, type Prices } from "./patrimonioCore";

export * from "./patrimonioCore";

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
