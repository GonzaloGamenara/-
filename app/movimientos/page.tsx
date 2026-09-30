"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { dayLabel, money } from "@/lib/format";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { TxRow } from "@/components/TxRow";
import { SearchIcon, XIcon } from "@/components/Icons";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Movimientos />
    </Suspense>
  );
}

function Movimientos() {
  const { txs, categories, loading } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const catFilter = params.get("cat");
  const [kind, setKind] = useState<"all" | "expense" | "income">("all");
  const [q, setQ] = useState("");

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

  const total = filtered.reduce((a, t) => a + (t.kind === "expense" ? -t.amount : t.amount), 0);
  const activeCat = categories.find((c) => c.id === catFilter);

  return (
    <div className="grid gap-3">
      <header className="rise flex items-center justify-between pt-1">
        <h1 className="text-xl font-semibold tracking-tight">Movimientos</h1>
        <MonthSwitcher />
      </header>

      <div className="rise flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5" style={{ animationDelay: "40ms" }}>
        <SearchIcon width={18} height={18} className="text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nota o categoría"
          className="w-full bg-transparent outline-none placeholder:text-muted"
        />
      </div>

      <div className="rise hide-scroll flex gap-2 overflow-x-auto text-sm" style={{ animationDelay: "60ms" }}>
        {([["all", "Todo"], ["expense", "Gastos"], ["income", "Ingresos"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`press shrink-0 rounded-full px-4 py-1.5 font-medium ${kind === k ? "bg-fg text-bg" : "bg-surface text-muted"}`}
          >
            {label}
          </button>
        ))}
        {activeCat && (
          <button
            onClick={() => router.replace("/movimientos")}
            className="press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-black"
            style={{ background: activeCat.color }}
          >
            {activeCat.emoji} {activeCat.name} <XIcon width={14} height={14} />
          </button>
        )}
      </div>

      {loading && txs.length === 0 ? (
        <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : groups.length === 0 ? (
        <p className="py-16 text-center text-muted">No hay movimientos con estos filtros.</p>
      ) : (
        <>
          <p className="px-1 text-xs text-muted">
            {filtered.length} movimientos ·{" "}
            <span className={`num font-semibold ${total < 0 ? "text-fg" : "text-inc"}`}>{money(total)}</span>
          </p>
          {groups.map(([day, items]) => {
            const dayTotal = items.reduce((a, t) => a + (t.kind === "expense" ? -t.amount : t.amount), 0);
            return (
              <section key={day} className="rise">
                <div className="flex items-center justify-between px-2 pb-0.5 pt-2 text-xs text-muted">
                  <span className="font-semibold capitalize">{dayLabel(day)}</span>
                  <span className="num">{money(dayTotal)}</span>
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
