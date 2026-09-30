"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useCardTxs } from "@/lib/useCardTxs";
import { nextPaymentPeriod } from "@/lib/cards";
import { compact, currentMonth, dueDate, money, monthEnd, monthStart } from "@/lib/format";
import { mine, type Card } from "@/lib/types";
import { CuentasTabs } from "@/components/CuentasTabs";
import { CardTile } from "@/components/CardTile";
import { CardForm } from "@/components/CardForm";
import { MigrationNotice } from "@/components/MigrationNotice";
import { PageHeader } from "@/components/PageHeader";
import { CardIcon, PlusIcon } from "@/components/Icons";

const dayMonth = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(iso + "T00:00")).replace(".", "");

export default function Tarjetas() {
  const { cards, recurring, loading, needsMigration } = useStore();
  const [editing, setEditing] = useState<Partial<Card> | null>(null);
  const rows = useCardTxs(monthStart(currentMonth()));

  const summary = useMemo(() => {
    return cards.map((card) => {
      const period = nextPaymentPeriod(card);
      const mineRows = (rows ?? []).filter((t) => t.card_id === card.id);
      const inPeriod = mineRows.filter((t) => t.occurred_on.startsWith(period));
      // Suscripciones que todavía no se generaron para ese resumen: se estiman
      const charged = new Set(inPeriod.map((t) => t.recurring_id).filter(Boolean));
      const estimated = recurring
        .filter((r) => r.card_id === card.id && r.active && !charged.has(r.id))
        .reduce((a, r) => a + r.amount, 0);
      const next = inPeriod.reduce((a, t) => a + t.amount, 0) + estimated;
      const later = mineRows.filter((t) => t.occurred_on > monthEnd(period) && t.purchase_id).reduce((a, t) => a + t.amount, 0);
      const plans = new Set(mineRows.filter((t) => t.installment).map((t) => t.purchase_id)).size;
      const myPart = inPeriod.reduce((a, t) => a + mine(t), 0) + estimated;
      return { card, period, next, later, plans, myPart, dueOn: dueDate(period, card.due_day) };
    });
  }, [cards, rows, recurring]);

  const totalNext = summary.reduce((a, s) => a + s.next, 0);

  return (
    <div className="grid gap-5">
      <CuentasTabs />
      <PageHeader
        title="Tarjetas"
        subtitle="Cada compra y suscripción, sumada al resumen de su tarjeta."
        right={
          !needsMigration && (
            <button
              onClick={() => setEditing({ due_day: 10 })}
              className="press flex shrink-0 items-center gap-1 rounded-full bg-surface px-3.5 py-2 text-sm font-medium"
            >
              <PlusIcon width={16} height={16} /> Tarjeta
            </button>
          )
        }
      />
      <MigrationNotice />

      {!needsMigration && cards.length > 1 && totalNext > 0 && (
        <div className="rise flex items-baseline justify-between px-1">
          <span className="text-sm text-muted">Próximos pagos, todas las tarjetas</span>
          <span className="num text-lg font-semibold">{money(totalNext)}</span>
        </div>
      )}

      {loading && !cards.length ? (
        <div className="skeleton h-44" />
      ) : !cards.length && !needsMigration ? (
        <section className="glass rise grid place-items-center gap-3 rounded-[28px] px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-inset">
            <CardIcon width={28} height={28} />
          </span>
          <h2 className="text-lg font-semibold">Sumá tu primera tarjeta</h2>
          <p className="max-w-72 text-sm text-muted">
            Con su día de pago. Después le cargás compras (en 1 pago o en cuotas) y suscripciones: cada una conserva su
            categoría y todas suman al resumen.
          </p>
          <button onClick={() => setEditing({ due_day: 10 })} className="press mt-1 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink">
            Agregar tarjeta
          </button>
        </section>
      ) : (
        <div className="grid gap-4">
          {summary.map((s, i) => (
            <Link key={s.card.id} href={`/tarjetas/${s.card.id}`} className="press rise block" style={{ animationDelay: `${i * 50}ms` }}>
              <CardTile card={s.card}>
                <div className="flex items-start justify-between">
                  <span className="text-lg font-semibold">{s.card.name}</span>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">Pago el {s.card.due_day}</span>
                </div>
                <p className="mt-6 text-xs text-white/75">Próximo pago · {dayMonth(s.dueOn)}</p>
                <p className="num text-3xl font-semibold">{rows === null ? "…" : money(s.next)}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80">
                  {s.plans > 0 && <span>{s.plans} {s.plans === 1 ? "plan" : "planes"} en cuotas</span>}
                  {s.later > 0 && <span>{compact(s.later)} ya comprometido después</span>}
                  {s.myPart < s.next - 0.5 && <span>tu parte {compact(s.myPart)}</span>}
                </div>
              </CardTile>
            </Link>
          ))}
        </div>
      )}

      {editing && <CardForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
