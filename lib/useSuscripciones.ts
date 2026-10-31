"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { txColumns, useStore } from "./store";
import { addMonths, currentMonth, monthStart, todayISO } from "./format";
import { detectCandidates, isRecent, subTotals, trackedItems, type HistTx } from "./suscripciones";

/** Un año de gastos (una vez por sesión; se vuelve a pedir si cambian tus fijos) */
let cache: { userId: string; sig: string; rows: HistTx[] } | null = null;

const dismissedKey = (uid: string) => `gastos.subs.no.${uid}`;
const seenKey = (uid: string) => `gastos.subs.visto.${uid}`;
const readList = (k: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeList = (k: string, v: string[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v.slice(-200)));
  } catch {
    /* no es crítico */
  }
};

/** Clave de un aviso de precio: si vuelve a cambiar, se avisa de nuevo */
export const alertKey = (recurringId: string, to: number) => `${recurringId}:${to}`;

export function useSuscripciones() {
  const { userId, txs, prevTxs, month, recurring, categories, cards, purchases, needsMigration } = useStore();
  const sig = recurring.map((r) => `${r.id}:${r.amount}:${r.active}`).join("|");
  const [base, setBase] = useState<HistTx[] | null>(() => (cache?.userId === userId && cache.sig === sig ? cache.rows : null));
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readList(dismissedKey(userId)));
    setSeen(readList(seenKey(userId)));
  }, [userId]);

  useEffect(() => {
    if (needsMigration) return;
    if (cache?.userId === userId && cache.sig === sig) {
      setBase(cache.rows);
      return;
    }
    let alive = true;
    supabase()
      .from("transactions")
      .select(txColumns)
      .eq("kind", "expense")
      .gte("occurred_on", monthStart(addMonths(currentMonth(), -12)))
      .order("occurred_on")
      .limit(5000)
      .then(({ data, error }) => {
        if (!alive) return;
        // Sin conexión: el radar trabaja con lo que ya está cargado
        const rows = error ? [] : ((data ?? []) as unknown as HistTx[]).map((t) => ({ ...t, amount: Number(t.amount), my_share: t.my_share == null ? null : Number(t.my_share) }));
        if (!error) cache = { userId, sig, rows };
        setBase(rows);
      });
    return () => {
      alive = false;
    };
  }, [userId, sig, needsMigration]);

  const today = todayISO();
  const data = useMemo(() => {
    // Los meses que ya tiene cargados la app pisan al historial (ediciones y borrados recientes)
    const loaded = new Set([month, addMonths(month, -1)]);
    const hist: HistTx[] = [
      ...(base ?? []).filter((t) => !loaded.has(t.occurred_on.slice(0, 7))),
      ...[...prevTxs, ...txs].filter((t) => t.kind === "expense"),
    ];
    const items = trackedItems(recurring, hist, categories, cards, today);
    const candidates = detectCandidates(hist, recurring, categories, purchases, today);
    return { items, candidates, totals: subTotals(items) };
  }, [base, month, prevTxs, txs, recurring, categories, cards, purchases, today]);

  const thisMonth = today.slice(0, 7);
  const alerts = data.items.filter(
    (i) => i.r.active && i.change && i.change.to > i.change.from && isRecent(i.change, thisMonth) && !seen.includes(alertKey(i.r.id, i.change.to)),
  );

  const dismiss = useCallback(
    (key: string) => {
      const next = [...readList(dismissedKey(userId)), key];
      writeList(dismissedKey(userId), next);
      setDismissed(next);
    },
    [userId],
  );
  const markSeen = useCallback(
    (key: string) => {
      const next = [...readList(seenKey(userId)), key];
      writeList(seenKey(userId), next);
      setSeen(next);
    },
    [userId],
  );

  return {
    ready: base !== null || needsMigration,
    ...data,
    candidates: data.candidates.filter((c) => !dismissed.includes(c.key)),
    alerts,
    dismiss,
    markSeen,
  };
}
