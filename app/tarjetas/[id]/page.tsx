"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useCardTxs } from "@/lib/useCardTxs";
import { installmentFor, nextPaymentPeriod, remaining } from "@/lib/cards";
import { currentMonth, dueDate, money, monthEnd, monthLabelCompact, monthStart } from "@/lib/format";
import { mine, type Recurring, type Transaction } from "@/lib/types";
import { CardTile } from "@/components/CardTile";
import { CardForm } from "@/components/CardForm";
import { MonthStepper } from "@/components/MonthStepper";
import { RecurringForm } from "@/components/RecurringForm";
import { ChevronLeft, PlusIcon } from "@/components/Icons";

interface Line {
  key: string;
  name: string;
  categoryId: string | null;
  badge: string;
  amount: number;
  myPart: number;
  estimated?: boolean;
  onOpen: () => void;
}

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const { cards, categories, purchases, recurring, openPurchase, openSheet, saveRecurring, loading } = useStore();
  const card = cards.find((c) => c.id === id);
  const [period, setPeriod] = useState<string | null>(null);
  const [editCard, setEditCard] = useState(false);
  const [editSub, setEditSub] = useState<Partial<Recurring> | null>(null);

  const shown = period ?? (card ? nextPaymentPeriod(card) : currentMonth());
  const rows = useCardTxs(monthStart(shown), monthEnd(shown), id);

  const cardPurchases = purchases.filter((p) => p.card_id === id);
  const subs = recurring.filter((r) => r.card_id === id);

  const lines = useMemo<Line[]>(() => {
    if (!rows) return [];
    const byPurchase = new Map(purchases.map((p) => [p.id, p]));
    const out: Line[] = rows.map((t: Transaction) => {
      const p = t.purchase_id ? byPurchase.get(t.purchase_id) : undefined;
      const badge = t.recurring_id ? "suscripción" : t.installment && p ? `${t.installment}/${p.installments}` : "1 pago";
      return {
        key: t.id,
        name: t.note || p?.description || "Compra",
        categoryId: t.category_id,
        badge,
        amount: t.amount,
        myPart: mine(t),
        onOpen: () => (p ? openPurchase({ purchase: p }) : openSheet({ editing: t })),
      };
    });
    // Suscripciones activas que todavía no se cobraron en este resumen (solo meses actuales/futuros)
    if (shown >= currentMonth()) {
      const charged = new Set(rows.map((t) => t.recurring_id).filter(Boolean));
      for (const r of subs.filter((r) => r.active && !charged.has(r.id))) {
        out.push({
          key: `est-${r.id}`,
          name: r.name,
          categoryId: r.category_id,
          badge: "suscripción · estimada",
          amount: r.amount,
          myPart: r.amount,
          estimated: true,
          onOpen: () => setEditSub(r),
        });
      }
    }
    const rank = (l: Line) => (l.badge.startsWith("suscripción") ? 1 : l.badge === "1 pago" ? 2 : 0);
    return out.sort((a, b) => rank(a) - rank(b) || b.amount - a.amount);
  }, [rows, purchases, subs, shown, openPurchase, openSheet]);

  if (!card) {
    return (
      <div className="grid gap-4 pt-4">
        <BackLink />
        <p className="text-muted">{loading ? "Cargando…" : "No encontré esta tarjeta."}</p>
      </div>
    );
  }

  const total = lines.reduce((a, l) => a + l.amount, 0);
  const myTotal = lines.reduce((a, l) => a + l.myPart, 0);
  const cat = (cid: string | null) => categories.find((c) => c.id === cid);
  const plans = cardPurchases
    .filter((p) => p.installments > 1)
    .map((p) => ({ p, left: remaining(p, currentMonth()), now: installmentFor(p, shown) }))
    .filter((x) => x.left.count > 0);

  return (
    <div className="grid gap-5">
      <BackLink />

      <CardTile card={card} className="rise">
        <div className="flex items-start justify-between">
          <span className="text-lg font-semibold">{card.name}</span>
          <button onClick={() => setEditCard(true)} className="press rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            Editar
          </button>
        </div>
        <p className="mt-6 text-xs text-white/75">
          Resumen de {monthLabelCompact(shown)} · se paga el {Number(dueDate(shown, card.due_day).slice(8, 10))}
        </p>
        <p className="num text-3xl font-semibold">{rows === null ? "…" : money(total)}</p>
        {myTotal < total - 0.5 && <p className="mt-1 text-xs text-white/80">Tu parte: {money(myTotal)}</p>}
      </CardTile>

      <div className="rise grid grid-cols-2 gap-2">
        <button onClick={() => openPurchase({ cardId: card.id })} className="press flex items-center justify-center gap-1.5 rounded-2xl bg-fg py-3 text-sm font-semibold text-bg">
          <PlusIcon width={16} height={16} /> Compra
        </button>
        <button onClick={() => setEditSub({ kind: "expense", card_id: card.id, active: true, day: card.due_day })} className="press flex items-center justify-center gap-1.5 rounded-2xl bg-surface py-3 text-sm font-semibold">
          <PlusIcon width={16} height={16} /> Suscripción
        </button>
      </div>

      {/* Resumen desglosado */}
      <section className="rise">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">Qué incluye</h2>
          <MonthStepper value={shown} onChange={setPeriod} />
        </div>
        {rows === null ? (
          <div className="grid gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : lines.length === 0 ? (
          <p className="glass rounded-3xl p-5 text-center text-sm text-muted">Nada en este resumen todavía.</p>
        ) : (
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {lines.map((l) => {
              const c = cat(l.categoryId);
              return (
                <li key={l.key}>
                  <button onClick={l.onOpen} className={`press flex w-full items-center gap-3 px-4 py-3 text-left ${l.estimated ? "opacity-60" : ""}`}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: `color-mix(in srgb, ${c?.color ?? "#64748b"} 22%, transparent)` }}>
                      {c?.emoji ?? "💳"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {c?.name ?? "Sin categoría"}
                        <span className="rounded-full bg-inset px-1.5 py-px text-[10px] font-medium text-fg/80">{l.badge}</span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="num block font-semibold">{money(l.amount)}</span>
                      {l.myPart < l.amount - 0.005 && <span className="num text-[11px] text-muted">tu parte {money(l.myPart)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Planes en cuotas */}
      {plans.length > 0 && (
        <section className="rise">
          <h2 className="mb-1 px-1 text-sm font-semibold">Planes en cuotas</h2>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {plans.map(({ p, left }) => {
              const done = p.installments - left.count;
              return (
                <li key={p.id}>
                  <button onClick={() => openPurchase({ purchase: p })} className="press w-full px-4 py-3 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{p.description}</span>
                      <span className="num shrink-0 text-sm font-semibold">{money(left.total)}</span>
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-muted">
                      <span>
                        {done}/{p.installments} pagadas · quedan {left.count}
                      </span>
                      <span>restante</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full" style={{ width: `${(done / p.installments) * 100}%`, background: card.color }} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Suscripciones */}
      {subs.length > 0 && (
        <section className="rise">
          <h2 className="mb-1 px-1 text-sm font-semibold">Suscripciones</h2>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {subs.map((r) => {
              const c = cat(r.category_id);
              return (
                <li key={r.id} className={r.active ? "" : "opacity-50"}>
                  <button onClick={() => setEditSub(r)} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="text-lg">{c?.emoji ?? "🔁"}</span>
                    <span className="flex-1 truncate font-medium">{r.name}</span>
                    {!r.active && <span className="rounded-full bg-inset px-2 py-0.5 text-[11px]">Pausada</span>}
                    <span className="num font-semibold">{money(r.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {editCard && <CardForm initial={card} onClose={() => setEditCard(false)} />}
      {editSub && (
        <RecurringForm
          initial={editSub}
          onClose={() => setEditSub(null)}
          onSave={async (r) => {
            await saveRecurring({ ...r, card_id: card.id });
            setEditSub(null);
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/fijos" className="press rise -ml-1 flex w-fit items-center gap-1 pt-1 text-sm text-muted">
      <span className="grid size-9 place-items-center rounded-full bg-surface">
        <ChevronLeft width={18} height={18} />
      </span>
      Fijos
    </Link>
  );
}
