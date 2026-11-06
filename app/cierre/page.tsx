"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { txColumns } from "@/lib/columns";
import { useStore } from "@/lib/store";
import { useBudgetItems, useTechos } from "@/lib/techosStore";
import { budgetStatus } from "@/lib/techos";
import { buildCierre } from "@/lib/cierre";
import { launchMonth } from "@/lib/launch";
import { addMonths, currentMonth, dayLabel, money, moneyRound, monthEnd, monthLabel, monthStart } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { BudgetBar } from "@/components/Techos";
import { ChevronLeft, ChevronRight } from "@/components/Icons";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CierreMes />
    </Suspense>
  );
}

const mesNombre = (ym: string) => monthLabel(ym).split(" ")[0].toLowerCase();
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 10) / 10).toLocaleString("es-AR")}%`;

function CierreMes() {
  const params = useSearchParams();
  const { categories, purchases } = useStore();
  const { ready: techosReady, missing: techosMissing, configFor } = useTechos();
  const last = addMonths(currentMonth(), -1);
  const first = launchMonth();
  const asked = params.get("mes");
  const mes = asked && /^\d{4}-\d{2}$/.test(asked) && asked <= last && asked >= first ? asked : last;
  const prevMes = addMonths(mes, -1);
  const comparable = prevMes >= first;

  const [txs, setTxs] = useState<{ mes: string; rows: Transaction[] } | null>(null);
  const [inflacion, setInflacion] = useState<{ valor: number; fecha: string } | null>(null);
  useEffect(() => {
    let alive = true;
    supabase()
      .from("transactions")
      .select(txColumns)
      .gte("occurred_on", monthStart(prevMes))
      .lte("occurred_on", monthEnd(mes))
      .then(({ data }) => {
        if (alive) setTxs({ mes, rows: ((data ?? []) as unknown as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount), my_share: t.my_share == null ? null : Number(t.my_share) })) });
      });
    return () => {
      alive = false;
    };
  }, [mes, prevMes]);
  useEffect(() => {
    fetch("/api/inflacion")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && typeof j.valor === "number" && setInflacion({ valor: j.valor, fecha: j.fecha }))
      .catch(() => {});
  }, []);

  const items = useBudgetItems(mes);
  const cierre = useMemo(() => {
    if (!txs || txs.mes !== mes || !items) return null;
    return buildCierre({
      mes,
      txs: txs.rows.filter((t) => t.occurred_on.startsWith(mes)),
      prevTxs: comparable ? txs.rows.filter((t) => t.occurred_on.startsWith(prevMes)) : null,
      items,
      categories,
      purchases,
    });
  }, [txs, mes, prevMes, comparable, items, categories, purchases]);
  const techos = useMemo(
    () => (techosReady && !techosMissing && items ? configFor(mes).map((cfg) => budgetStatus(cfg, items, mes)).sort((a, b) => b.pct - a.pct) : []),
    [techosReady, techosMissing, items, configFor, mes],
  );
  const cumplidos = techos.filter((s) => s.spent <= s.cfg.monthly + 0.005).length;
  const cat = (id: string | null) => categories.find((c) => c.id === id);
  const inflMes = inflacion ? inflacion.fecha.slice(0, 7) : null;

  return (
    <div className="grid gap-4">
      <header className="rise flex items-center gap-2 pt-1">
        <Link href="/" aria-label="Volver" className="press -ml-2 grid size-10 place-items-center rounded-full">
          <ChevronLeft width={22} height={22} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Cierre de {mesNombre(mes)}</h1>
          <p className="mt-0.5 text-sm text-muted">Cómo te fue en {monthLabel(mes)}</p>
        </div>
        <div className="flex shrink-0 items-center rounded-full bg-surface">
          {mes > first ? (
            <Link href={`/cierre?mes=${prevMes}`} aria-label="Mes anterior" className="press grid size-10 place-items-center">
              <ChevronLeft width={18} height={18} />
            </Link>
          ) : (
            <span className="grid size-10 place-items-center text-muted/40">
              <ChevronLeft width={18} height={18} />
            </span>
          )}
          {mes < last ? (
            <Link href={`/cierre?mes=${addMonths(mes, 1)}`} aria-label="Mes siguiente" className="press grid size-10 place-items-center">
              <ChevronRight width={18} height={18} />
            </Link>
          ) : (
            <span className="grid size-10 place-items-center text-muted/40">
              <ChevronRight width={18} height={18} />
            </span>
          )}
        </div>
      </header>

      {!cierre ? (
        <div className="grid gap-4">
          <div className="skeleton h-44" />
          <div className="skeleton h-64" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="grid min-w-0 gap-4">
            {/* Lo principal: cuánto ahorraste */}
            <section className="glass rise relative overflow-hidden rounded-[28px] p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-40 blur-3xl"
                style={{ background: `radial-gradient(closest-side, ${cierre.saved >= 0 ? "var(--inc)" : "var(--exp)"}, transparent)` }}
              />
              <p className="relative text-sm text-muted">{cierre.saved >= 0 ? "Ahorraste" : "Gastaste más de lo que entró"}</p>
              <p className={`num relative text-[clamp(2.25rem,11vw,3rem)] font-semibold leading-none ${cierre.saved < 0 ? "text-exp" : ""}`}>
                {moneyRound(Math.abs(cierre.saved))}
              </p>
              {cierre.rate !== null && (
                <p className="relative mt-1.5 text-sm text-muted">
                  {cierre.saved >= 0 ? `el ${Math.round(cierre.rate * 100)}% de lo que entró` : "usaste ahorros o te endeudaste para cubrirlo"}
                </p>
              )}
              <div className="relative mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-2xl bg-inset py-2.5">
                  <div className="num text-lg font-semibold text-inc">{moneyRound(cierre.earned)}</div>
                  <div className="text-[11px] text-muted">entró</div>
                </div>
                <div className="rounded-2xl bg-inset py-2.5">
                  <div className="num text-lg font-semibold">{moneyRound(cierre.spent)}</div>
                  <div className="text-[11px] text-muted">gastaste</div>
                </div>
              </div>
            </section>

            {/* Contra el mes anterior y la inflación */}
            <section className="glass rise grid gap-2 rounded-3xl p-4 text-sm">
              <h2 className="font-semibold">Comparado</h2>
              {cierre.prev && cierre.spentDelta !== null ? (
                <>
                  <p>
                    Gastaste{" "}
                    <b className={`num ${cierre.spentDelta > 0 ? "text-exp" : "text-inc"}`}>{pct(cierre.spentDelta)}</b> que en {mesNombre(prevMes)} (
                    <span className="num">{moneyRound(cierre.prev.spent)}</span>).
                  </p>
                  {cierre.prev.rate !== null && cierre.rate !== null && (
                    <p className="text-muted">
                      Ahorro: <span className="num">{Math.round(cierre.prev.rate * 100)}%</span> en {mesNombre(prevMes)} →{" "}
                      <b className="num text-fg">{Math.round(cierre.rate * 100)}%</b> en {mesNombre(mes)}.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted">Es tu primer mes completo en la app: todavía no hay un mes anterior para comparar.</p>
              )}
              {inflacion && (
                <p className="text-muted">
                  Inflación de {inflMes ? mesNombre(inflMes) : "último mes"}: <b className="num text-fg">{inflacion.valor.toLocaleString("es-AR")}%</b> (INDEC)
                  {cierre.spentDelta !== null && inflMes === mes
                    ? cierre.spentDelta > inflacion.valor
                      ? ". Tus gastos subieron más que los precios."
                      : ". Tus gastos subieron menos que los precios: en términos reales gastaste menos."
                    : inflMes && inflMes < mes
                      ? `. El dato de ${mesNombre(mes)} sale a mediados del mes que viene.`
                      : "."}
                </p>
              )}
            </section>

            {/* Techos */}
            {techos.length > 0 && (
              <section className="glass rise grid gap-3 rounded-3xl p-4">
                <div>
                  <h2 className="font-semibold">
                    Techos: cumpliste {cumplidos} de {techos.length}
                  </h2>
                  <p className="text-xs text-muted">
                    Gastado {money(techos.reduce((a, s) => a + s.spent, 0))} de {money(techos.reduce((a, s) => a + s.cfg.monthly, 0))}. Las compras con tarjeta
                    cuentan el mes en que compraste.
                  </p>
                </div>
                <ul className="grid gap-2">
                  {techos.map((s) => (
                    <li key={s.cfg.id}>
                      <BudgetBar s={s} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <div className="grid min-w-0 gap-4">
            {/* Los gastos más grandes */}
            {cierre.top.length > 0 && (
              <section className="glass rise rounded-3xl p-4">
                <h2 className="font-semibold">Tus 5 gastos más grandes</h2>
                <p className="mb-2 text-xs text-muted">Sin contar fijos. Con tarjeta, en el mes en que compraste (en cuotas, la cuota del mes).</p>
                <ol className="grid">
                  {cierre.top.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 py-2">
                      <span className="num w-4 shrink-0 text-center text-sm font-semibold text-muted">{i + 1}</span>
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-2xl text-base"
                        style={{ background: `color-mix(in srgb, ${cat(t.categoryId)?.color ?? "#64748b"} 22%, transparent)` }}
                      >
                        {cat(t.categoryId)?.emoji ?? "🏷️"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{t.label}</span>
                        <span className="block truncate text-xs text-muted">
                          {cat(t.categoryId)?.name ?? "Sin categoría"} · {dayLabel(t.date)}
                        </span>
                      </span>
                      <span className="num shrink-0 font-semibold">{money(t.amount)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Categorías */}
            {cierre.categories.length > 0 && (
              <section className="glass rise rounded-3xl p-4">
                <h2 className="mb-2 font-semibold">En qué se fue</h2>
                <ul className="grid gap-2.5">
                  {cierre.categories.slice(0, 8).map((c) => {
                    const delta = c.prev !== null && c.prev > 0 ? ((c.amount - c.prev) / c.prev) * 100 : null;
                    return (
                      <li key={c.id ?? "sin"} className="grid gap-1">
                        <div className="flex items-baseline gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">
                            {c.emoji} {c.name}
                          </span>
                          {c.prev !== null && (
                            <span className={`num shrink-0 text-[11px] ${delta === null ? "text-muted" : delta > 0 ? "text-exp" : "text-inc"}`}>
                              {delta === null ? "nuevo" : pct(delta)}
                            </span>
                          )}
                          <span className="num shrink-0 font-semibold">{money(c.amount)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-inset">
                          <div className="h-full rounded-full" style={{ width: `${(c.amount / cierre.categories[0].amount) * 100}%`, background: c.color }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted">Gastos e ingresos como en Inicio: las tarjetas cuentan el mes en que se pagan.</p>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
