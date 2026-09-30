"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useCardSummary } from "@/lib/useCardSummary";
import { installmentAmounts, installmentFor, nextInstallment, remaining } from "@/lib/cards";
import { currentMonth, dueDate, money, monthLabel, todayISO } from "@/lib/format";
import { launchMonth } from "@/lib/launch";
import type { Card, Purchase, Recurring } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { RecurringForm } from "@/components/RecurringForm";
import { CardForm } from "@/components/CardForm";
import { MigrationNotice } from "@/components/MigrationNotice";
import { Sheet } from "@/components/Sheet";
import { usePrelaunch } from "@/components/LaunchGate";
import { ChevronRight, PlusIcon } from "@/components/Icons";
import { CuotasCalcSheet } from "@/components/CuotasCalc";

type Adding = null | "menu" | "calc";

export default function Fijos() {
  const { recurring, categories, saveRecurring, txs, month, cards, purchases, openPurchase, needsMigration } = useStore();
  const prelaunch = usePrelaunch();
  const { summary, rows: cardRows } = useCardSummary();
  const [editing, setEditing] = useState<Partial<Recurring> | null>(null);
  const [cardForm, setCardForm] = useState<Partial<Card> | null>(null);
  const [adding, setAdding] = useState<Adding>(null);

  const isCurrent = month === currentMonth() && !prelaunch;
  const applied = new Set(txs.filter((t) => t.period === month).map((t) => t.recurring_id));
  // Mes de referencia para "cuánto sale por mes": el actual (o el de arranque en preparación)
  const refMonth = prelaunch ? launchMonth() : currentMonth();

  const incomes = recurring.filter((r) => r.kind === "income");
  const expenses = recurring.filter((r) => r.kind === "expense" && !r.card_id);
  const plansOf = (cardId: string) =>
    purchases.filter((p) => p.card_id === cardId && p.installments > 1 && remaining(p, refMonth).count > 0);
  const cuotaDelMes = (p: Purchase) => {
    const k = installmentFor(p, refMonth);
    return k ? installmentAmounts(p.total_amount, p.installments)[k - 1] : 0;
  };

  const incomeTotal = incomes.filter((r) => r.active).reduce((a, r) => a + r.amount, 0);
  const expenseTotal =
    expenses.filter((r) => r.active).reduce((a, r) => a + r.amount, 0) +
    recurring.filter((r) => r.kind === "expense" && r.card_id && r.active).reduce((a, r) => a + r.amount, 0) +
    purchases.filter((p) => p.installments > 1).reduce((a, p) => a + cuotaDelMes(p), 0);

  const cat = (id: string | null) => categories.find((c) => c.id === id);
  const status = (r: Recurring) =>
    !r.active
      ? "Pausado"
      : prelaunch
        ? "Desde octubre"
        : isCurrent && applied.has(r.id)
          ? "✓ Este mes"
          : isCurrent && dueDate(month, r.day) > todayISO()
            ? "Pendiente"
            : null;

  const empty = !recurring.length && !cards.length;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Fijos"
        subtitle="Todo lo que entra y sale cada mes: sueldo, alquiler, suscripciones y cuotas."
        right={
          <button onClick={() => setAdding("menu")} className="press flex shrink-0 items-center gap-1 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">
            <PlusIcon width={16} height={16} /> Agregar
          </button>
        }
      />
      <MigrationNotice />

      {!empty && (
        <section className="glass rise grid grid-cols-3 divide-x divide-line rounded-[28px] py-4 text-center">
          <div className="px-2">
            <p className="text-[11px] text-muted">Entra</p>
            <p className="num truncate text-base font-semibold text-inc">{money(incomeTotal)}</p>
          </div>
          <div className="px-2">
            <p className="text-[11px] text-muted">Sale</p>
            <p className="num truncate text-base font-semibold">{money(expenseTotal)}</p>
          </div>
          <div className="px-2">
            <p className="text-[11px] text-muted">Queda</p>
            <p className={`num truncate text-base font-semibold ${incomeTotal - expenseTotal < 0 ? "text-exp" : ""}`}>
              {money(incomeTotal - expenseTotal)}
            </p>
          </div>
          <p className="col-span-3 mt-2 border-0 text-[11px] text-muted">por mes, con cuotas y suscripciones incluidas</p>
        </section>
      )}

      {empty && (
        <section className="glass rise grid gap-2 rounded-[28px] p-5">
          <h2 className="font-semibold">Empezá por lo que se repite</h2>
          <p className="text-sm text-muted">Tu sueldo o beca, el alquiler, los servicios, tus tarjetas con sus cuotas y suscripciones. Se cargan solos cada mes.</p>
          <button onClick={() => setAdding("menu")} className="press mt-2 rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink">
            Agregar el primero
          </button>
        </section>
      )}

      {incomes.length > 0 && (
        <Group title="Ingresos">
          {incomes.map((r) => (
            <Row key={r.id} emoji={cat(r.category_id)?.emoji ?? "💼"} color={cat(r.category_id)?.color} title={r.name} sub={`Día ${r.day}`} badge={status(r)} amount={money(r.amount)} tone="text-inc" dim={!r.active} onClick={() => setEditing(r)} />
          ))}
        </Group>
      )}

      {expenses.length > 0 && (
        <Group title="Gastos">
          {expenses.map((r) => (
            <Row key={r.id} emoji={cat(r.category_id)?.emoji ?? "🏠"} color={cat(r.category_id)?.color} title={r.name} sub={`Día ${r.day}`} badge={status(r)} amount={money(r.amount)} dim={!r.active} onClick={() => setEditing(r)} />
          ))}
        </Group>
      )}

      {/* Cada tarjeta, con sus suscripciones y cuotas */}
      {summary.map(({ card, next, dueOn, period }) => {
        const subs = recurring.filter((r) => r.card_id === card.id);
        const plans = plansOf(card.id);
        // Compras en 1 pago que entran en el próximo resumen
        const oneOffs = cardRows
          .filter((t) => t.card_id === card.id && t.occurred_on.startsWith(period) && t.purchase_id)
          .map((t) => ({ t, p: purchases.find((p) => p.id === t.purchase_id) }))
          .filter((x): x is { t: typeof x.t; p: Purchase } => !!x.p && x.p.installments === 1);
        const periodShort = monthLabel(period).split(" ")[0].slice(0, 3).toLowerCase();
        return (
          <section key={card.id} className="rise">
            <Link href={`/tarjetas/${card.id}`} className="press mb-1 flex items-center gap-2 px-1">
              <span className="h-4 w-6 rounded-[5px]" style={{ background: `linear-gradient(135deg, ${card.color}, color-mix(in srgb, ${card.color} 50%, #000))` }} />
              <span className="text-sm font-semibold">{card.name}</span>
              <span className="text-xs text-muted">· paga el {card.due_day}</span>
              <span className="num ml-auto text-sm font-semibold">{money(next)}</span>
              <ChevronRight width={16} height={16} className="text-muted" />
            </Link>
            <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
              {subs.map((r) => (
                <Row key={r.id} emoji={cat(r.category_id)?.emoji ?? "🔁"} color={cat(r.category_id)?.color} title={r.name} sub="Suscripción" badge={r.active ? null : "Pausada"} amount={money(r.amount)} dim={!r.active} onClick={() => setEditing(r)} />
              ))}
              {plans.map((p) => {
                const k = installmentFor(p, refMonth);
                const left = remaining(p, refMonth);
                const nx = nextInstallment(p, refMonth);
                const nxMonth = nx ? monthLabel(nx.period).split(" ")[0].slice(0, 3).toLowerCase() : "";
                return (
                  <Row
                    key={p.id}
                    emoji={cat(p.category_id)?.emoji ?? "💳"}
                    color={cat(p.category_id)?.color}
                    title={p.description}
                    sub={`Quedan ${left.count} ${left.count === 1 ? "cuota" : "cuotas"}`}
                    badge={k ? `${k}/${p.installments}` : nx ? `${nx.k}/${p.installments} · ${nxMonth}` : null}
                    amount={money(cuotaDelMes(p) || installmentAmounts(p.total_amount, p.installments)[0])}
                    onClick={() => openPurchase({ purchase: p })}
                  />
                );
              })}
              {oneOffs.map(({ t, p }) => (
                <Row
                  key={t.id}
                  emoji={cat(p.category_id)?.emoji ?? "🛍️"}
                  color={cat(p.category_id)?.color}
                  title={p.description}
                  sub="Compra en 1 pago"
                  badge={`resumen ${periodShort}`}
                  amount={money(t.amount)}
                  onClick={() => openPurchase({ purchase: p })}
                />
              ))}
              {!subs.length && !plans.length && !oneOffs.length && (
                <li className="px-4 py-3.5 text-sm text-muted">Sin suscripciones ni cuotas. Próximo pago {dueOn.slice(8, 10)}/{dueOn.slice(5, 7)}.</li>
              )}
              <li className="grid grid-cols-2 divide-x divide-line">
                <button onClick={() => openPurchase({ cardId: card.id })} className="press py-3 text-sm font-medium text-accent2">
                  + Compra / cuotas
                </button>
                <button onClick={() => setEditing({ kind: "expense", card_id: card.id, active: true, day: card.due_day })} className="press py-3 text-sm font-medium text-accent2">
                  + Suscripción
                </button>
              </li>
            </ul>
          </section>
        );
      })}

      {/* Menú de "Agregar" */}
      {adding === "menu" && (
        <Sheet open onClose={() => setAdding(null)} title="¿Qué querés agregar?">
          <div className="grid gap-2">
            {[
              { e: "💼", t: "Ingreso fijo", d: "Sueldo, beca, un alquiler que cobrás", go: () => setEditing({ kind: "income", day: 1, active: true }) },
              { e: "🏠", t: "Gasto fijo o suscripción", d: "Alquiler, luz, gimnasio, Spotify… (con o sin tarjeta)", go: () => setEditing({ kind: "expense", day: 1, active: true }) },
              {
                e: "💳",
                t: "Compra en cuotas",
                d: cards.length ? "Heladera, celular… también planes que ya venías pagando" : "Primero agregás la tarjeta",
                go: () => (cards.length ? openPurchase({ cardId: cards[0].id }) : setCardForm({ due_day: 10 })),
                hidden: needsMigration,
              },
              { e: "🧮", t: "¿Me conviene en cuotas?", d: "Compará contado vs cuotas antes de comprar", go: () => setAdding("calc") },
              { e: "🪪", t: "Tarjeta", d: "Con su día de pago, para sumarle cuotas y suscripciones", go: () => setCardForm({ due_day: 10 }), hidden: needsMigration },
            ]
              .filter((o) => !o.hidden)
              .map((o) => (
                <button
                  key={o.t}
                  onClick={() => {
                    setAdding(null);
                    setTimeout(o.go, 0);
                  }}
                  className="press flex items-center gap-3 rounded-2xl bg-inset px-4 py-3.5 text-left"
                >
                  <span className="text-2xl">{o.e}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{o.t}</span>
                    <span className="block text-xs text-muted">{o.d}</span>
                  </span>
                  <ChevronRight width={18} height={18} className="shrink-0 text-muted" />
                </button>
              ))}
          </div>
        </Sheet>
      )}

      {editing && (
        <RecurringForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await saveRecurring(r);
            setEditing(null);
          }}
        />
      )}
      {adding === "calc" && <CuotasCalcSheet onClose={() => setAdding(null)} />}
      {cardForm && <CardForm initial={cardForm} onClose={() => setCardForm(null)} />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rise">
      <h2 className="mb-1 px-1 text-sm font-semibold">{title}</h2>
      <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">{children}</ul>
    </section>
  );
}

function Row({
  emoji,
  color,
  title,
  sub,
  badge,
  amount,
  tone = "",
  dim = false,
  onClick,
}: {
  emoji: string;
  color?: string;
  title: string;
  sub: string;
  badge?: string | null;
  amount: string;
  tone?: string;
  dim?: boolean;
  onClick: () => void;
}) {
  return (
    <li className={dim ? "opacity-50" : ""}>
      <button onClick={onClick} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: `color-mix(in srgb, ${color ?? "#64748b"} 22%, transparent)` }}>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">{sub}</span>
            {badge && <span className="shrink-0 rounded-full bg-inset px-2 py-0.5 text-[11px] font-medium leading-none text-fg/80">{badge}</span>}
          </span>
        </span>
        <span className={`num shrink-0 font-semibold ${tone}`}>{amount}</span>
      </button>
    </li>
  );
}
