"use client";

import Link from "next/link";
import { alertKey, useSuscripciones } from "@/lib/useSuscripciones";
import { money } from "@/lib/format";
import { XIcon } from "./Icons";

/** Inicio: aviso cuando una suscripción o un fijo sube de precio (se cierra con la X) */
export function SubsAlert({ delay = 0 }: { delay?: number }) {
  const { alerts, markSeen } = useSuscripciones();
  if (!alerts.length) return null;
  const shown = alerts.slice(0, 2);
  return (
    <section className="glass rise grid gap-2 rounded-2xl p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{alerts.length === 1 ? "Algo subió de precio" : `${alerts.length} cosas subieron de precio`}</h2>
        <Link href="/suscripciones" className="text-xs text-muted">
          Ver suscripciones
        </Link>
      </div>
      <ul className="grid gap-1.5">
        {shown.map((i) => {
          const c = i.change!;
          return (
            <li key={i.r.id} className="flex items-center gap-3 rounded-2xl bg-exp/8 py-2 pl-3 pr-1.5">
              <span className="text-lg font-semibold text-exp">↑</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {i.r.name}: {money(c.from)} → {money(c.to)}
                </span>
                <span className="block text-xs text-muted">
                  <span className="num">+{Math.round(c.pct)}%</span> · son <span className="num">{money((c.to - c.from) * 12)}</span> más por año
                </span>
              </span>
              <button
                onClick={() => markSeen(alertKey(i.r.id, c.to))}
                aria-label={`Ocultar aviso de ${i.r.name}`}
                className="press grid size-8 shrink-0 place-items-center rounded-full text-muted"
              >
                <XIcon width={16} height={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
