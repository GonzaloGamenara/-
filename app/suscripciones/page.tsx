"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useSuscripciones } from "@/lib/useSuscripciones";
import { isRecent, isSubsCategory, type Candidate, type PriceChange, type SubItem } from "@/lib/suscripciones";
import { money, monthLabel, todayISO } from "@/lib/format";
import type { Recurring } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { PlanTabs } from "@/components/PlanTabs";
import { EyeToggle } from "@/components/EyeToggle";
import { RecurringForm } from "@/components/RecurringForm";
import { MigrationNotice } from "@/components/MigrationNotice";
import { PlusIcon } from "@/components/Icons";

const mes = (ym: string) => monthLabel(ym).split(" ")[0].slice(0, 3).toLowerCase();
/** "2026-11-09" → "9 nov" */
const corto = (iso: string) => `${Number(iso.slice(8, 10))} ${mes(iso.slice(0, 7))}`;
const pct = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n) < 10 ? Math.abs(n).toFixed(1).replace(".", ",") : Math.round(Math.abs(n))}%`;
const cuando = (c: PriceChange) => (c.period ? `desde ${mes(c.period)}` : "desde el próximo cobro");

export default function Suscripciones() {
  const { recurring, categories, cards, saveRecurring, needsMigration } = useStore();
  const { ready, items, candidates, totals, dismiss } = useSuscripciones();
  const [editing, setEditing] = useState<{ r: Partial<Recurring>; link?: Candidate["link"] } | null>(null);

  const thisMonth = todayISO().slice(0, 7);
  const subsCat = categories.find(isSubsCategory);
  const cat = (id: string | null) => categories.find((c) => c.id === id);
  const income = recurring.filter((r) => r.kind === "income" && r.active).reduce((a, r) => a + r.amount, 0);

  const active = items.filter((i) => i.r.active);
  const subs = active.filter((i) => i.group === "suscripcion");
  const fijos = active.filter((i) => i.group === "fijo");
  const paused = items.filter((i) => !i.r.active);
  const changes = active.filter((i) => i.change && isRecent(i.change, thisMonth));
  const empty = ready && !items.length && !candidates.length;

  const addCandidate = (c: Candidate) =>
    setEditing({
      r: {
        kind: "expense",
        name: c.name,
        amount: c.amount,
        // Si estaba en otra categoría pero es un servicio conocido, va a Suscripciones
        category_id: c.why === "repite" ? c.categoryId : (subsCat?.id ?? c.categoryId),
        day: c.day,
        card_id: c.cardId && cards.some((k) => k.id === c.cardId) ? c.cardId : null,
        active: true,
      },
      link: c.link,
    });

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Plan"
        subtitle="Lo que se cobra solo"
        right={
          <div className="flex items-center gap-1.5">
            <EyeToggle />
            <button
              onClick={() => setEditing({ r: { kind: "expense", day: 1, active: true, category_id: subsCat?.id ?? null } })}
              className="press flex shrink-0 items-center gap-1 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg"
            >
              <PlusIcon width={16} height={16} /> Agregar
            </button>
          </div>
        }
      />
      <PlanTabs />
      <MigrationNotice />

      {!empty && (
        <section className="glass elevated rise grid gap-3 rounded-2xl p-5">
          <div>
            <p className="text-sm text-muted">
              {totals.subsCount === 1 ? "Tu suscripción" : totals.subsCount ? `Tus ${totals.subsCount} suscripciones` : "Suscripciones activas"}
            </p>
            <p className="num mt-0.5 text-3xl font-semibold tracking-tight">
              {money(totals.subsMonthly)}
              <span className="ml-1 text-base font-medium text-muted">por mes</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-inset px-2 py-2.5">
              <div className="num truncate text-lg font-semibold">{money(totals.subsMonthly * 12)}</div>
              <div className="text-xs text-muted">por año</div>
            </div>
            <div className="rounded-2xl bg-inset px-2 py-2.5">
              <div className="num text-lg font-semibold">
                {income > 0 ? `${((totals.subsMonthly / income) * 100).toFixed(1).replace(".", ",").replace(",0", "")}%` : "—"}
              </div>
              <div className="text-xs text-muted">de lo que entra por mes</div>
            </div>
          </div>
          {totals.fijosMonthly > 0 && (
            <p className="text-xs text-muted">
              Con servicios y otros fijos: <b className="num whitespace-nowrap text-fg">{money(totals.subsMonthly + totals.fijosMonthly)}</b> por mes ·{" "}
              <b className="num whitespace-nowrap text-fg">{money((totals.subsMonthly + totals.fijosMonthly) * 12)}</b> por año
            </p>
          )}
        </section>
      )}

      {empty && (
        <section className="glass rise grid gap-2 rounded-2xl p-5">
          <h2 className="font-semibold">Nada que se cobre solo, por ahora</h2>
          <p className="text-sm text-muted">
            Cargá tus suscripciones (Spotify, Netflix, iCloud…) y servicios como fijos y acá vas a ver cuánto te cuestan por año y si suben de precio.
          </p>
          <button
            onClick={() => setEditing({ r: { kind: "expense", day: 1, active: true, category_id: subsCat?.id ?? null } })}
            className="press mt-2 rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink"
          >
            Agregar una suscripción
          </button>
        </section>
      )}

      {changes.length > 0 && (
        <Group title="Cambios de precio">
          {changes.map((i) => {
            const c = i.change!;
            const up = c.to > c.from;
            return (
              <li key={i.r.id}>
                <button onClick={() => setEditing({ r: i.r })} className="press row-hover flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg font-semibold ${up ? "bg-exp/12 text-exp" : "bg-inc/12 text-inc"}`}>
                    {up ? "↑" : "↓"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {i.r.name} {up ? "subió" : "bajó"}
                    </span>
                    <span className="block text-xs text-muted">
                      <span className="num">
                        {money(c.from)} → {money(c.to)}
                      </span>{" "}
                      · {cuando(c)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`num block font-semibold ${up ? "text-exp" : "text-inc"}`}>{pct(c.pct)}</span>
                    <span className="num block text-xs text-muted">
                      {up ? "+" : "−"}
                      {money(Math.abs(c.to - c.from) * 12)}/año
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </Group>
      )}

      {subs.length > 0 && (
        <Group title="Suscripciones">
          {subs.map((i) => (
            <ItemRow key={i.r.id} i={i} emoji={cat(i.r.category_id)?.emoji ?? "🔁"} color={cat(i.r.category_id)?.color} thisMonth={thisMonth} onClick={() => setEditing({ r: i.r })} />
          ))}
        </Group>
      )}

      {fijos.length > 0 && (
        <Group title="Servicios y otros fijos">
          {fijos.map((i) => (
            <ItemRow key={i.r.id} i={i} emoji={cat(i.r.category_id)?.emoji ?? "🏠"} color={cat(i.r.category_id)?.color} thisMonth={thisMonth} onClick={() => setEditing({ r: i.r })} />
          ))}
        </Group>
      )}

      {candidates.length > 0 && (
        <section className="rise">
          <h2 className="mb-0.5 px-1 text-sm font-semibold">¿Son suscripciones?</h2>
          <p className="mb-2 px-1 text-xs text-muted">Gastos que se repiten o parecen suscripciones y no están en tus fijos.</p>
          <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
            {candidates.map((c) => (
              <li key={c.key} className="grid gap-2.5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
                    style={{ background: `color-mix(in srgb, ${cat(c.categoryId)?.color ?? "#64748b"} 22%, transparent)` }}
                  >
                    {cat(c.categoryId)?.emoji ?? "🔁"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-xs text-muted">
                      {c.why === "repite" ? `Se repite hace ${c.months} meses` : c.why === "servicio" ? "Parece un servicio" : "Está en Suscripciones"} · último {corto(c.lastDate)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold">{money(c.amount)}</span>
                    {c.change && <span className={`num block text-xs ${c.change.pct > 0 ? "text-exp" : "text-inc"}`}>{pct(c.change.pct)}</span>}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 pl-[3.25rem]">
                  <button onClick={() => addCandidate(c)} className="press rounded-xl bg-accent py-2 text-sm font-semibold text-accent-ink">
                    Agregar como fijo
                  </button>
                  <button onClick={() => dismiss(c.key)} className="press rounded-xl bg-inset px-4 py-2 text-sm font-medium text-muted">
                    No es
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paused.length > 0 && (
        <section className="rise">
          <h2 className="mb-0.5 px-1 text-sm font-semibold">Pausadas</h2>
          <p className="mb-2 px-1 text-xs text-muted">
            Te ahorrás <b className="num text-inc">{money(totals.pausedMonthly * 12)}</b> por año.
          </p>
          <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
            {paused.map((i) => (
              <ItemRow key={i.r.id} i={i} emoji={cat(i.r.category_id)?.emoji ?? "⏸️"} color={cat(i.r.category_id)?.color} thisMonth={thisMonth} onClick={() => setEditing({ r: i.r })} />
            ))}
          </ul>
        </section>
      )}

      {!needsMigration && ready && items.length > 0 && (
        <p className="px-1 text-xs text-muted">
          El costo por año es el monto de hoy × 12. Si un cobro sube, aparece en “Cambios de precio”; si el banco te cobra distinto, editá el movimiento de ese mes y el radar lo
          detecta.
        </p>
      )}

      {editing && (
        <RecurringForm
          initial={editing.r}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await saveRecurring(r, { link: editing.link });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rise">
      <h2 className="mb-1 px-1 text-sm font-semibold">{title}</h2>
      <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">{children}</ul>
    </section>
  );
}

function ItemRow({ i, emoji, color, thisMonth, onClick }: { i: SubItem; emoji: string; color?: string; thisMonth: string; onClick: () => void }) {
  const c = i.change && isRecent(i.change, thisMonth) ? i.change : null;
  const where = i.card?.name ?? "Débito / efectivo";
  const sub = i.nextDate ? `${where} · próx. ${corto(i.nextDate)}` : i.lastCharge ? `Último cobro ${corto(i.lastCharge.date)}` : where;
  return (
    <li className={i.r.active ? "" : "opacity-60"}>
      <button onClick={onClick} className="press row-hover flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `color-mix(in srgb, ${color ?? "#64748b"} 22%, transparent)` }}>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{i.r.name}</span>
            {c && (
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none ${c.to > c.from ? "bg-exp/12 text-exp" : "bg-inc/12 text-inc"}`}>
                {c.to > c.from ? "↑" : "↓"} {pct(c.pct)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="num block font-semibold">{money(i.monthly)}</span>
          <span className="num block text-xs text-muted">{money(i.yearly)}/año</span>
        </span>
      </button>
    </li>
  );
}
