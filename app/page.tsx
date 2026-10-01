"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useShared } from "@/lib/sharedStore";
import { monthStats } from "@/lib/stats";
import { LAUNCH_DATE } from "@/lib/launch";
import { compact, money, moneyRound, monthLabel } from "@/lib/format";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { EyeToggle } from "@/components/EyeToggle";
import { PageHeader } from "@/components/PageHeader";
import { DayBars, Donut, StackBar } from "@/components/charts";
import { TxRow } from "@/components/TxRow";
import { ArrowUpRight } from "@/components/Icons";

export default function Home() {
  const { month, txs, prevTxs, categories, recurring, loading, openSheet, splits, cards } = useStore();
  const { myNet, groups } = useShared();
  // Saldo con otras personas: compras divididas + cuentas compartidas
  const owed = Math.round((splits.filter((x) => !x.settled_on).reduce((a, x) => a + x.amount, 0) + myNet) * 100) / 100;
  const sharedTxIds = useMemo(() => new Set(groups.map((g) => g.transaction_id).filter((x): x is string => !!x)), [groups]);
  const s = useMemo(
    () =>
      monthStats(month, txs, prevTxs, categories, recurring, {
        trackingStart: LAUNCH_DATE,
        sharedTxIds,
        cardName: (id) => cards.find((c) => c.id === id)?.name,
      }),
    [month, txs, prevTxs, categories, recurring, sharedTxIds, cards],
  );
  const monthName = monthLabel(month).split(" ")[0].toLowerCase();
  const daysLeft = s.dim - s.elapsed;

  return (
    <div className="grid gap-4">
      <PageHeader title="Resumen" right={<div className="flex items-center gap-1.5"><EyeToggle /><MonthSwitcher /></div>} />

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
          {/* Hero: lo gastado, desglosado, y lo que viene */}
          <section className="glass rise relative overflow-hidden rounded-[28px] p-5" style={{ animationDelay: "40ms" }}>
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--exp), transparent)" }}
            />
            <p className="relative text-sm text-muted">
              {s.isCurrent ? `Gastaste en ${monthName}, hasta hoy` : `Gastaste en ${monthName}`}
            </p>
            <div className="relative mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="num text-[clamp(2.25rem,11vw,3.25rem)] font-semibold leading-none">{money(s.spent)}</span>
              {s.deltaVsPrev !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    s.deltaVsPrev > 0 ? "bg-exp/15 text-exp" : "bg-inc/15 text-inc"
                  }`}
                  title="Comparado con los mismos días del mes anterior"
                >
                  <ArrowUpRight width={12} height={12} className={s.deltaVsPrev > 0 ? "" : "rotate-90"} />
                  {Math.abs(Math.round(s.deltaVsPrev * 100))}% vs mismo día del mes ant.
                </span>
              )}
            </div>

            {/* Desglose sin solapamientos */}
            {s.spent > 0 && (
              <div className="relative mt-5 grid gap-2.5">
                <StackBar parts={s.breakdown.map((b) => ({ key: b.key, value: b.total, color: b.color }))} />
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {s.breakdown
                    .filter((b) => b.total > 0)
                    .map((b) => (
                      <li key={b.key} className="flex items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: b.color }} />
                        <span className="text-muted">{b.label}</span>
                        <span className="num ml-auto font-semibold">{compact(b.total)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div className="relative mt-5">
              <DayBars values={s.perDay} planned={s.perDayPlanned} today={s.isCurrent ? s.elapsed : undefined} />
              <div className="relative mt-2 flex justify-between text-[10px] text-muted">
                <span>1</span>
                {s.isCurrent && s.elapsed > 2 && s.elapsed < s.dim - 1 && (
                  <span
                    className="absolute -translate-x-1/2 font-semibold text-fg"
                    style={{ left: `${((s.elapsed - 0.5) / s.dim) * 100}%` }}
                  >
                    hoy
                  </span>
                )}
                <span>{s.dim}</span>
              </div>
            </div>

            {s.isCurrent && (s.committed > 0 || s.projected !== null) && (
              <p className="relative mt-4 rounded-2xl bg-inset px-3.5 py-2.5 text-sm text-muted">
                {s.committed > 0 && (
                  <>
                    Ya tenés <b className="num text-fg">{money(s.committed)}</b> comprometidos para lo que queda del mes
                    {s.projected === null ? "." : " · "}
                  </>
                )}
                {s.projected !== null && (
                  <>
                    con tu ritmo de día a día, cerrarías en <b className="num text-fg">{moneyRound(s.projected)}</b>.
                  </>
                )}
              </p>
            )}
          </section>

          {/* Métricas */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Ingresos"
              value={moneyRound(s.earned)}
              tone="text-inc"
              delay={80}
              hint={s.toCollect > 0 ? `+${compact(s.toCollect)} por cobrar` : s.isCurrent ? "cobrados hasta hoy" : undefined}
            />
            <Stat
              label={s.isCurrent ? "Libre a fin de mes" : "Te quedó"}
              value={moneyRound(s.isCurrent ? s.freeAtEnd : s.balanceNow)}
              tone={(s.isCurrent ? s.freeAtEnd : s.balanceNow) < 0 ? "text-exp" : ""}
              delay={120}
              hint={
                s.isCurrent
                  ? "ingresos − gastos − lo comprometido"
                  : s.savingsRate !== null
                    ? `${Math.round(s.savingsRate * 100)}% de tus ingresos`
                    : undefined
              }
            />
            <Stat
              label="Ritmo diario"
              value={s.dailyRate !== null ? moneyRound(s.dailyRate) : "—"}
              delay={160}
              hint={s.dailyRate !== null ? "promedio del día a día" : `se calcula desde el día 3`}
            />
            <Stat
              label={s.isCurrent ? "Comprometido" : "Fijos y tarjeta"}
              value={moneyRound(s.isCurrent ? s.committed : s.breakdown[1].total + s.breakdown[2].total)}
              delay={200}
              hint={s.isCurrent ? (daysLeft > 0 ? `en los próximos ${daysLeft} días` : "nada más este mes") : "del total del mes"}
            />
          </section>

          {Math.abs(owed) >= 1 && (
            <Link href="/dividir" className="glass press rise flex items-center justify-between rounded-3xl px-4 py-3.5" style={{ animationDelay: "210ms" }}>
              <span className="text-sm">
                <span className="text-muted">{owed > 0 ? "Te deben" : "Debés"}</span>{" "}
                <b className={`num ${owed > 0 ? "text-inc" : "text-exp"}`}>{money(Math.abs(owed))}</b>
              </span>
              <span className="text-xs text-muted">Ver detalle →</span>
            </Link>
          )}

          {/* Lo que viene este mes */}
          {s.scheduled.length > 0 && (
            <section className="glass rise rounded-[28px] p-4" style={{ animationDelay: "220ms" }}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Lo que viene este mes</h2>
                <Link href="/fijos" className="text-xs text-muted">Ver fijos</Link>
              </div>
              <ul className="grid gap-2.5">
                {s.scheduled.map((x) => (
                  <li key={x.key} className="flex items-center gap-3 text-sm">
                    <span className="num w-11 shrink-0 text-xs text-muted">día {x.day}</span>
                    <span className="shrink-0">{x.emoji}</span>
                    <span className="min-w-0 flex-1 truncate">{x.label}</span>
                    <span className={`num shrink-0 font-medium ${x.kind === "income" ? "text-inc" : ""}`}>
                      {x.kind === "income" ? "+" : "−"}
                      {money(x.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Por categoría */}
          {s.expenseCats.length > 0 && (
            <section className="glass rise rounded-[28px] p-5" style={{ animationDelay: "260ms" }}>
              <h2 className="mb-4 text-sm font-semibold">En qué gastaste</h2>
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
                    <Link href={c.id ? `/movimientos?cat=${c.id}` : "/movimientos"} className="press block rounded-2xl px-2 py-2.5 hover:bg-surface">
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
              <h2 className="mb-3 text-sm font-semibold">De dónde vino la plata</h2>
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

          {/* Últimos (solo lo que ya pasó) */}
          {s.recent.length > 0 && (
            <section className="rise" style={{ animationDelay: "300ms" }}>
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">Últimos movimientos</h2>
                <Link href="/movimientos" className="text-xs text-muted">Ver todos</Link>
              </div>
              <div className="grid">
                {s.recent.slice(0, 5).map((t) => <TxRow key={t.id} tx={t} showDate />)}
              </div>
            </section>
          )}
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
