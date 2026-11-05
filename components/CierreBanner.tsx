"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { addMonths, currentMonth, monthLabel, moneyRound, todayISO } from "@/lib/format";
import { launchMonth } from "@/lib/launch";
import { mine } from "@/lib/types";
import { XIcon } from "./Icons";

const key = (ym: string) => `gastos.cierre.visto.${ym}`;

/** Inicio, los primeros 10 días del mes: "Cerró octubre: ahorraste $X" → pantalla de cierre */
export function CierreBanner({ delay = 0 }: { delay?: number }) {
  const { month, prevTxs } = useStore();
  const mes = addMonths(currentMonth(), -1);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key(mes)) === "1");
    } catch {
      setHidden(false);
    }
  }, [mes]);
  if (hidden || Number(todayISO().slice(8, 10)) > 10 || mes < launchMonth() || month !== currentMonth()) return null;

  const earned = prevTxs.filter((t) => t.kind === "income").reduce((a, t) => a + Number(t.amount), 0);
  const spent = prevTxs.filter((t) => t.kind === "expense").reduce((a, t) => a + mine(t), 0);
  const saved = earned - spent;
  const nombre = monthLabel(mes).split(" ")[0].toLowerCase();

  return (
    <div className="glass rise flex items-center gap-2 rounded-3xl py-2 pl-3 pr-1.5" style={{ animationDelay: `${delay}ms` }}>
      <Link href={`/cierre?mes=${mes}`} className="press flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inset text-lg">📊</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight">Cerró {nombre}: mirá cómo te fue</span>
          <span className="block truncate text-xs text-muted">
            {earned > 0 || spent > 0 ? (
              saved >= 0 ? (
                <>
                  Ahorraste <b className="num text-inc">{moneyRound(saved)}</b>
                  {earned > 0 && ` (${Math.round((saved / earned) * 100)}%)`} · techos y tus gastos más grandes
                </>
              ) : (
                <>
                  Gastaste <b className="num text-exp">{moneyRound(-saved)}</b> más de lo que entró
                </>
              )
            ) : (
              "Ahorro, techos y tus gastos más grandes"
            )}
          </span>
        </span>
      </Link>
      <button
        onClick={() => {
          try {
            localStorage.setItem(key(mes), "1");
          } catch {
            /* no es crítico */
          }
          setHidden(true);
        }}
        aria-label="Ocultar"
        className="press grid size-8 shrink-0 place-items-center rounded-full text-muted"
      >
        <XIcon width={16} height={16} />
      </button>
    </div>
  );
}
