"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { monthStats } from "@/lib/stats";
import { compact, money, moneyRound, monthLabel } from "@/lib/format";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { PageHeader } from "@/components/PageHeader";
import { DayBars, Donut } from "@/components/charts";
import { TxRow } from "@/components/TxRow";
import { ArrowUpRight } from "@/components/Icons";

export default function Home() {
  const { month, txs, prevTxs, categories, recurring, loading, openSheet } = useStore();
  const s = useMemo(
    () => monthStats(month, txs, prevTxs, categories, recurring),
    [month, txs, prevTxs, categories, recurring],
  );
  const monthName = monthLabel(month).split(" ")[0].toLowerCase();

  return (
    <div className="grid gap-4">
      <PageHeader title="Resumen" right={<MonthSwitcher />} />

      {loading && txs.length === 0 ? (
        <div className="grid gap-4">
          <div className="skeleton h-60" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
          </div>
          <div className="skeleton h-72" />
        </div>
      ) : txs.length === 0 ? (
        <Empty onAdd={() => openSheet()} month={month} />
      ) : (
        <>
          {/* Hero */}
          <section className="glass rise relative overflow-hidden rounded-[28px] p-5" style={{ animationDelay: "40ms" }}>
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--exp), transparent)" }}
            />
            <p className="relative text-sm text-muted">Gastaste en {monthName}</p>
            <div className="relative mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="num text-[clamp(2.25rem,11vw,3.25rem)] font-semibold leading-none">{money(s.spent)}</span>
              {s.deltaVsPrev !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    s.deltaVsPrev > 0 ? "bg-exp/15 text-exp" : "bg-inc/15 text-inc"
                  }`}
                >
                  <ArrowUpRight width={12} height={12} className={s.deltaVsPrev > 0 ? "" : "rotate-90"} />
                  {Math.abs(Math.round(s.deltaVsPrev * 100))}% vs mes ant.
                </span>
              )}
            </div>
            <div className="relative mt-6">
              <DayBars values={s.perDay} today={s.isCurrent ? s.elapsed : undefined} />
              <div className="mt-2 flex justify-between text-[10px] text-muted">
                <span>1</span>
                {s.isCurrent && <span className="font-semibold text-fg">hoy {s.elapsed}</span>}
                <span>{s.dim}</span>
              </div>
            </div>
            {s.isCurrent && s.projected > s.spent + 1 && (
              <p className="relative mt-4 rounded-2xl bg-surface px-3.5 py-2.5 text-sm text-muted">
                A este ritmo cerrás el mes en <b className="num text-fg">{moneyRound(s.projected)}</b>
                {s.upcomingExpense > 0 && <> · incluye {compact(s.upcomingExpense)} de fijos por venir</>}.
              </p>
            )}
          </section>

          {/* Métricas */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Ingresos" value={moneyRound(s.earned)} tone="text-inc" delay={80} hint={s.upcomingIncome > 0 ? `+${compact(s.upcomingIncome)} por cobrar` : undefined} />
            <Stat
              label="Te queda"
              value={moneyRound(s.balance)}
              tone={s.balance < 0 ? "text-exp" : ""}
              delay={120}
              hint={s.savingsRate !== null ? `${Math.round(s.savingsRate * 100)}% de tus ingresos` : "sin ingresos cargados"}
            />
            <Stat label="Por día" value={moneyRound(s.dailyAvg)} delay={160} hint="gastos variables, sin fijos" />
            <Stat
              label="Fijos"
              value={`${s.spent > 0 ? Math.round((s.fixedSpent / s.spent) * 100) : 0}%`}
              delay={200}
              hint={`${compact(s.fixedSpent)} fijos · ${compact(s.variableSpent)} variables`}
            />
          </section>

          {/* Fijos que faltan */}
          {s.upcoming.length > 0 && (
            <section className="glass rise rounded-[28px] p-4" style={{ animationDelay: "220ms" }}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Todavía por venir</h2>
                <Link href="/fijos" className="text-xs text-muted">Ver fijos</Link>
              </div>
              <ul className="grid gap-2">
                {s.upcoming.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-muted">día {r.day}</span>
                      {r.name}
                    </span>
                    <span className={`num shrink-0 font-medium ${r.kind === "income" ? "text-inc" : ""}`}>
                      {r.kind === "income" ? "+" : "−"}{money(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Por categoría */}
          {s.expenseCats.length > 0 && (
            <section className="glass rise rounded-[28px] p-5" style={{ animationDelay: "260ms" }}>
              <h2 className="mb-4 text-sm font-semibold">En qué gastás</h2>
              <div className="flex items-center gap-5">
                <Donut
                  slices={s.expenseCats}
                  size={140}
                  center={
                    <div>
                      <div className="num text-lg font-semibold">{compact(s.spent)}</div>
                      <div className="text-[11px] text-muted">{s.expenseCats.length} categ.</div>
                    </div>
                  }
                />
                <ul className="grid min-w-0 flex-1 gap-2">
                  {s.expenseCats.slice(0, 4).map((c) => (
                    <li key={c.id ?? "none"} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.name}</span>
                      <span className="num ml-auto shrink-0 text-muted">{Math.round(c.share * 100)}%</span>
                    </li>
                  ))}
                  {s.expenseCats.length > 4 && <li className="text-xs text-muted">+{s.expenseCats.length - 4} más</li>}
                </ul>
              </div>
              <ul className="mt-5 grid gap-0.5">
                {s.expenseCats.map((c) => (
                  <li key={c.id ?? "none"}>
                    <Link
                      href={c.id ? `/movimientos?cat=${c.id}` : "/movimientos"}
                      className="press block rounded-2xl px-2 py-2.5 hover:bg-surface"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `color-mix(in srgb, ${c.color} 22%, transparent)` }}>
                          {c.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{c.name}</span>
                          <span className="text-xs text-muted">{c.count} {c.count === 1 ? "movimiento" : "movimientos"}</span>
                        </span>
                        <span className="text-right">
                          <span className="num block font-semibold">{money(c.total)}</span>
                          <span className="num text-xs text-muted">{Math.round(c.share * 100)}%</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(c.share * 100, 2)}%`, background: c.color, transition: "width .6s ease" }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* De dónde viene */}
          {s.incomeCats.length > 0 && (
            <section className="glass rise rounded-[28px] p-5" style={{ animationDelay: "280ms" }}>
              <h2 className="mb-3 text-sm font-semibold">De dónde viene</h2>
              <ul className="grid gap-2.5">
                {s.incomeCats.map((c) => (
                  <li key={c.id ?? "none"} className="flex items-center gap-3 text-sm">
                    <span className="text-lg">{c.emoji}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="num font-semibold text-inc">+{money(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Últimos */}
          <section className="rise" style={{ animationDelay: "300ms" }}>
            <div className="mb-1 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Últimos movimientos</h2>
              <Link href="/movimientos" className="text-xs text-muted">Ver todos</Link>
            </div>
            <div className="grid">
              {txs.slice(0, 5).map((t) => <TxRow key={t.id} tx={t} showDate />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone = "", delay = 0 }: { label: string; value: string; hint?: string; tone?: string; delay?: number }) {
  return (
    <div className="glass rise min-w-0 rounded-3xl p-4" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 truncate text-[clamp(1.05rem,5vw,1.3rem)] font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

function Empty({ onAdd, month }: { onAdd: () => void; month: string }) {
  return (
    <section className="glass rise grid place-items-center gap-3 rounded-[28px] px-6 py-14 text-center">
      <div className="text-5xl">🌱</div>
      <h2 className="text-lg font-semibold">Nada en {monthLabel(month)} todavía</h2>
      <p className="max-w-64 text-sm text-muted">Tocá el botón + y anotá tu primer movimiento. Toma 3 segundos.</p>
      <button onClick={onAdd} className="press mt-2 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink">
        Anotar ahora
      </button>
    </section>
  );
}
