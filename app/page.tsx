"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { monthStats } from "@/lib/stats";
import { compact, money, monthLabel } from "@/lib/format";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { DayBars, Donut } from "@/components/charts";
import { TxRow } from "@/components/TxRow";
import { ArrowUpRight } from "@/components/Icons";

export default function Home() {
  const { month, txs, prevTxs, categories, recurring, loading, openSheet } = useStore();
  const s = useMemo(() => monthStats(month, txs, prevTxs, categories, recurring), [month, txs, prevTxs, categories, recurring]);
  const today = s.isCurrent ? s.elapsed : undefined;

  return (
    <div className="grid gap-4">
      <header className="rise flex items-center justify-between pt-1">
        <h1 className="text-xl font-semibold tracking-tight">Resumen</h1>
        <MonthSwitcher />
      </header>

      {loading && txs.length === 0 ? (
        <div className="grid gap-4">
          <div className="skeleton h-56" />
          <div className="grid grid-cols-2 gap-3"><div className="skeleton h-24" /><div className="skeleton h-24" /></div>
        </div>
      ) : txs.length === 0 ? (
        <Empty onAdd={() => openSheet()} month={month} />
      ) : (
        <>
          {/* Hero */}
          <section className="glass rise rounded-[28px] p-5" style={{ animationDelay: "40ms" }}>
            <p className="text-sm text-muted">Gastaste en {monthLabel(month, "long").split(" ")[0].toLowerCase()}</p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="num text-[44px] font-semibold leading-none">{money(s.spent)}</span>
              {s.deltaVsPrev !== null && (
                <span
                  className={`mb-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    s.deltaVsPrev > 0 ? "bg-exp/15 text-exp" : "bg-inc/15 text-inc"
                  }`}
                >
                  <ArrowUpRight width={12} height={12} className={s.deltaVsPrev > 0 ? "" : "rotate-90"} />
                  {Math.abs(Math.round(s.deltaVsPrev * 100))}% vs mes ant.
                </span>
              )}
            </div>
            <div className="mt-5">
              <DayBars values={s.perDay} today={today} />
              <div className="mt-1.5 flex justify-between text-[10px] text-muted">
                <span>1</span>
                <span>{s.dim}</span>
              </div>
            </div>
            {s.isCurrent && s.projected > s.spent && (
              <p className="mt-3 rounded-2xl bg-surface px-3.5 py-2.5 text-sm text-muted">
                A este ritmo cerrás el mes en <b className="num text-fg">{money(s.projected)}</b>
                {s.upcomingExpense > 0 && <> (incluye {compact(s.upcomingExpense)} de fijos por venir)</>}.
              </p>
            )}
          </section>

          {/* Bento */}
          <section className="grid grid-cols-2 gap-3">
            <Stat label="Ingresos" value={money(s.earned)} tone="text-inc" delay={80} hint={s.upcomingIncome > 0 ? `+${compact(s.upcomingIncome)} por cobrar` : undefined} />
            <Stat
              label="Balance"
              value={money(s.balance)}
              tone={s.balance < 0 ? "text-exp" : ""}
              delay={120}
              hint={s.savingsRate !== null ? `${Math.round(s.savingsRate * 100)}% ahorrado` : undefined}
            />
            <Stat label="Promedio diario" value={money(s.dailyAvg)} delay={160} hint="solo gastos variables" />
            <Stat
              label="Fijos vs variables"
              value={`${s.spent > 0 ? Math.round((s.fixedSpent / s.spent) * 100) : 0}% fijos`}
              delay={200}
              hint={`${compact(s.fixedSpent)} · ${compact(s.variableSpent)}`}
            />
          </section>

          {/* Fijos que faltan */}
          {s.upcoming.length > 0 && (
            <section className="glass rise rounded-[28px] p-4" style={{ animationDelay: "220ms" }}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Todavía por venir</h2>
                <Link href="/fijos" className="text-xs text-muted">Ver fijos</Link>
              </div>
              <ul className="grid gap-1.5">
                {s.upcoming.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted">
                      Día {r.day} · <span className="text-fg">{r.name}</span>
                    </span>
                    <span className={`num font-medium ${r.kind === "income" ? "text-inc" : ""}`}>
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
              <div className="flex items-center gap-4">
                <Donut
                  slices={s.expenseCats}
                  size={148}
                  center={
                    <div>
                      <div className="text-[11px] text-muted">{s.expenseCats.length} categorías</div>
                      <div className="num text-lg font-semibold">{compact(s.spent)}</div>
                    </div>
                  }
                />
                <ul className="grid min-w-0 flex-1 gap-2">
                  {s.expenseCats.slice(0, 4).map((c) => (
                    <li key={c.id ?? "none"} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.name}</span>
                      <span className="num ml-auto text-muted">{Math.round(c.share * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="mt-5 grid gap-1">
                {s.expenseCats.map((c) => (
                  <li key={c.id ?? "none"}>
                    <Link
                      href={c.id ? `/movimientos?cat=${c.id}` : "/movimientos"}
                      className="press block rounded-2xl px-2 py-2.5 hover:bg-surface"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{c.emoji}</span>
                        <span className="flex-1 text-[15px] font-medium">
                          {c.name}
                          <span className="ml-2 text-xs font-normal text-muted">{c.count} mov.</span>
                        </span>
                        <span className="num font-semibold">{money(c.total)}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(c.share * 100, 2)}%`, background: c.color, transition: "width .6s ease" }}
                        />
                      </div>
                    </Link>
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
              {txs.slice(0, 5).map((t) => <TxRow key={t.id} tx={t} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone = "", delay = 0 }: { label: string; value: string; hint?: string; tone?: string; delay?: number }) {
  return (
    <div className="glass rise rounded-3xl p-4" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num mt-1 truncate text-xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
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
