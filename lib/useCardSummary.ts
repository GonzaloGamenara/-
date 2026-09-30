"use client";

import { useMemo } from "react";
import { useStore } from "./store";
import { useCardTxs } from "./useCardTxs";
import { nextPaymentPeriod } from "./cards";
import { currentMonth, dueDate, monthEnd, monthStart } from "./format";
import { mine, type Card } from "./types";

export interface CardSummary {
  card: Card;
  /** Mes del próximo pago */
  period: string;
  dueOn: string;
  /** Total del próximo resumen (incluye suscripciones estimadas) */
  next: number;
  myPart: number;
  /** Cuotas ya comprometidas después del próximo resumen */
  later: number;
}

/** Próximo pago y comprometido de cada tarjeta. */
export function useCardSummary() {
  const { cards, recurring } = useStore();
  const rows = useCardTxs(monthStart(currentMonth()));

  const summary = useMemo<CardSummary[]>(
    () =>
      cards.map((card) => {
        const period = nextPaymentPeriod(card);
        const own = (rows ?? []).filter((t) => t.card_id === card.id);
        const inPeriod = own.filter((t) => t.occurred_on.startsWith(period));
        // Suscripciones que todavía no se generaron para ese resumen: se estiman
        const charged = new Set(inPeriod.map((t) => t.recurring_id).filter(Boolean));
        const estimated = recurring
          .filter((r) => r.card_id === card.id && r.active && !charged.has(r.id))
          .reduce((a, r) => a + r.amount, 0);
        return {
          card,
          period,
          dueOn: dueDate(period, card.due_day),
          next: inPeriod.reduce((a, t) => a + t.amount, 0) + estimated,
          myPart: inPeriod.reduce((a, t) => a + mine(t), 0) + estimated,
          later: own.filter((t) => t.occurred_on > monthEnd(period) && t.purchase_id).reduce((a, t) => a + t.amount, 0),
        };
      }),
    [cards, rows, recurring],
  );

  return { summary, loading: rows === null };
}
