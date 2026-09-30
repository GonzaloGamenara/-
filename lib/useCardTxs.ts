"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { txColumns, useStore } from "./store";
import type { Transaction } from "./types";

/**
 * Movimientos con tarjeta en un rango de fechas (resúmenes y cuotas futuras).
 * Se vuelve a pedir cuando cambian tarjetas, compras o suscripciones.
 */
export function useCardTxs(from: string, to?: string, cardId?: string) {
  const { cards, purchases, recurring, txs, needsMigration } = useStore();
  const [rows, setRows] = useState<Transaction[] | null>(null);

  useEffect(() => {
    if (needsMigration) return setRows([]);
    let alive = true;
    let q = supabase().from("transactions").select(txColumns).not("card_id", "is", null).gte("occurred_on", from);
    if (to) q = q.lte("occurred_on", to);
    if (cardId) q = q.eq("card_id", cardId);
    q.order("occurred_on").then(({ data, error }) => {
      if (!alive) return;
      setRows(
        error
          ? []
          : ((data ?? []) as unknown as Transaction[]).map((t) => ({
              ...t,
              amount: Number(t.amount),
              my_share: t.my_share == null ? t.my_share : Number(t.my_share),
            })),
      );
    });
    return () => {
      alive = false;
    };
    // txs: refresca cuando editás/borrás un movimiento desde otra pantalla
  }, [from, to, cardId, cards, purchases, recurring, txs, needsMigration]);

  return rows;
}
