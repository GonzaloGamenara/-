"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { dayLabel, money, todayISO } from "@/lib/format";
import { mine } from "@/lib/types";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { PageHeader } from "@/components/PageHeader";
import { TxRow } from "@/components/TxRow";
import { SearchIcon, XIcon } from "@/components/Icons";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Movimientos />
    </Suspense>
  );
}

const signed = (t: { kind: string; amount: number; my_share?: number | null }) => (t.kind === "expense" ? -mine(t) : t.amount);

function Movimientos() {
  const { txs, categories, loading, openSheet } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const catFilter = params.get("cat");
  const [kind, setKind] = useState<"all" | "expense" | "income">("all");
  const [q, setQ] = useState("");

  const setCat = (id: string | null) => router.replace(id ? `/movimientos?cat=${id}` : "/movimientos");

  // Categorías que tienen movimientos este mes (para los chips)
  const usedCats = useMemo(() => {
    const ids = new Set(txs.map((t) => t.category_id));
    return categories.filter((c) => ids.has(c.id));
  }, [txs, categories]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs.filter((t) => {
      if (kind !== "all" && t.kind !== kind) return false;
      if (catFilter && t.category_id !== catFilter) return false;
      if (needle) {
        const cat = categories.find((c) => c.id === t.category_id)?.name ?? "";
        if (!`${t.note ?? ""} ${cat}`.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [txs, kind, catFilter, q, categories]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) map.set(t.occurred_on, [...(map.get(t.occurred_on) ?? []), t]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const today = todayISO();
  // Lo programado (fecha futura: cuotas/resúmenes de tarjeta) no cuenta como gastado todavía
  const spent = filtered.filter((t) => t.kind === "expense" && t.occurred_on <= today).reduce((a, t) => a + mine(t), 0);
  const programmed = filtered.filter((t) => t.kind === "expense" && t.occurred_on > today).reduce((a, t) => a + mine(t), 0);
  const earned = filtered.filter((t) => t.kind === "income").reduce((a, t) => a + t.amount, 0);
  const hasFilters = kind !== "all" || !!catFilter || !!q;

  return (
    <div className="grid gap-3">
      <PageHeader title="Movimientos" right={<MonthSwitcher />} />

      <label className="rise flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5 focus-within:border-accent2" style={{ animationDelay: "40ms" }}>
        <SearchIcon width={18} height={18} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nota o categoría"
          aria-label="Buscar"
          className="w-full bg-transparent outline-none placeholder:text-muted"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Limpiar búsqueda" className="text-muted">
            <XIcon width={16} height={16} />
          </button>
        )}
      </label>

      <div className="rise hide-scroll -mx-4 flex gap-2 overflow-x-auto px-4 text-sm" style={{ animationDelay: "60ms" }}>
        {([["all", "Todo"], ["expense", "Gastos"], ["income", "Ingresos"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`press shrink-0 rounded-full px-4 py-1.5 font-medium ${kind === k ? "bg-fg text-bg" : "bg-surface text-muted"}`}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 w-px shrink-0 self-stretch bg-line" />
        {usedCats.map((c) => {
          const on = c.id === catFilter;
          return (
            <button
              key={c.id}
              onClick={() => setCat(on ? null : c.id)}
              aria-pressed={on}
              className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${on ? "text-black" : "bg-surface text-muted"}`}
              style={on ? { background: c.color } : undefined}
            >
              <span>{c.emoji}</span>
              {c.name}
            </button>
          );
        })}
      </div>

      {loading && txs.length === 0 ? (
        <div className="grid gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : groups.length === 0 ? (
        <div className="glass grid place-items-center gap-2 rounded-[28px] px-6 py-14 text-center">
          <div className="text-4xl">{hasFilters ? "🔍" : "🗒️"}</div>
          <p className="font-medium">{hasFilters ? "Nada con estos filtros" : "Todavía no hay movimientos este mes"}</p>
          {hasFilters ? (
            <button onClick={() => { setKind("all"); setQ(""); setCat(null); }} className="press mt-1 rounded-full bg-surface px-4 py-2 text-sm font-medium">
              Limpiar filtros
            </button>
          ) : (
            <button onClick={() => openSheet()} className="press mt-1 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink">
              Anotar ahora
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="rise flex flex-wrap gap-x-3 px-1 text-xs text-muted">
            <span>{filtered.length} {filtered.length === 1 ? "movimiento" : "movimientos"}</span>
            {spent > 0 && <span>Gastos <b className="num text-fg">{money(spent)}</b></span>}
            {earned > 0 && <span>Ingresos <b className="num text-inc">{money(earned)}</b></span>}
            {programmed > 0 && <span>Programado <b className="num text-fg">{money(programmed)}</b></span>}
          </p>
          {groups.map(([day, items]) => {
            const dayTotal = items.reduce((a, t) => a + signed(t), 0);
            return (
              <section key={day} className={`rise ${day > today ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between px-2 pb-0.5 pt-3 text-xs text-muted">
                  <span className="font-semibold capitalize">
                    {day > today && <span className="mr-1.5 rounded-full bg-inset px-2 py-0.5 normal-case text-fg/80">Programado</span>}
                    {dayLabel(day)}
                  </span>
                  {items.length > 1 && <span className="num">{dayTotal < 0 ? "−" : "+"}{money(Math.abs(dayTotal))}</span>}
                </div>
                {items.map((t) => <TxRow key={t.id} tx={t} />)}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
