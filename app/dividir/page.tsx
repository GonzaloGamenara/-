"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { dayLabel, money } from "@/lib/format";
import type { Split } from "@/lib/types";
import { MigrationNotice } from "@/components/MigrationNotice";
import { PageHeader } from "@/components/PageHeader";
import { ChevronLeft } from "@/components/Icons";

interface Origin {
  label: string;
  date: string;
}

export default function Dividir() {
  const { splits, purchases, settleSplit, needsMigration, openSheet } = useStore();
  const [origins, setOrigins] = useState<Record<string, Origin>>({});
  const [showHistory, setShowHistory] = useState(false);

  // De qué gasto viene cada parte (los movimientos pueden no estar cargados en memoria)
  useEffect(() => {
    const ids = [...new Set(splits.map((s) => s.transaction_id).filter((x): x is string => !!x))].filter((id) => !origins[id]);
    if (!ids.length) return;
    supabase()
      .from("transactions")
      .select("id,note,occurred_on")
      .in("id", ids)
      .then(({ data }) => {
        if (!data) return;
        setOrigins((o) => {
          const next = { ...o };
          for (const t of data) next[t.id] = { label: t.note || "Gasto", date: t.occurred_on };
          return next;
        });
      });
  }, [splits, origins]);

  const originOf = (s: Split): Origin => {
    if (s.purchase_id) {
      const p = purchases.find((x) => x.id === s.purchase_id);
      return { label: p ? `${p.description}${p.installments > 1 ? ` · ${p.installments} cuotas` : ""}` : "Compra con tarjeta", date: p?.purchased_on ?? "" };
    }
    return origins[s.transaction_id ?? ""] ?? { label: "…", date: "" };
  };

  const pending = splits.filter((s) => !s.settled_on);
  const settled = splits.filter((s) => s.settled_on).slice(0, 30);

  const people = useMemo(() => {
    const map = new Map<string, { name: string; total: number; items: Split[] }>();
    for (const s of pending) {
      const key = s.name.trim().toLowerCase();
      const cur = map.get(key) ?? { name: s.name.trim(), total: 0, items: [] };
      cur.total += s.amount;
      cur.items.push(s);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [pending]);

  const totalOwed = people.reduce((a, p) => a + p.total, 0);

  return (
    <div className="grid gap-5">
      <Link href="/ajustes" className="press rise -ml-1 flex w-fit items-center gap-1 pt-1 text-sm text-muted">
        <span className="grid size-9 place-items-center rounded-full bg-surface">
          <ChevronLeft width={18} height={18} />
        </span>
        Perfil
      </Link>
      <PageHeader title="Gastos divididos" subtitle="Lo que pagaste por otros. En tus métricas cuenta solo tu parte." />
      <MigrationNotice />

      {!needsMigration && (
        <section className="glass rise rounded-[28px] p-5">
          <p className="text-sm text-muted">Te deben</p>
          <p className="num text-4xl font-semibold">{money(totalOwed)}</p>
          <p className="mt-1 text-xs text-muted">
            {people.length ? `${people.length} ${people.length === 1 ? "persona" : "personas"}` : "Nadie te debe nada 🎉"}
          </p>
        </section>
      )}

      {people.map((p) => (
        <section key={p.name} className="glass rise overflow-hidden rounded-3xl">
          <div className="flex items-center gap-3 px-4 pb-2 pt-4">
            <span className="grid size-10 place-items-center rounded-full bg-inset font-semibold">{p.name[0]?.toUpperCase()}</span>
            <span className="flex-1 font-semibold">{p.name}</span>
            <span className="num font-semibold">{money(p.total)}</span>
          </div>
          <ul className="divide-y divide-line">
            {p.items.map((s) => {
              const o = originOf(s);
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.date && <span className="text-xs capitalize text-muted">{dayLabel(o.date)}</span>}
                  </span>
                  <span className="num text-muted">{money(s.amount)}</span>
                  <button onClick={() => settleSplit(s.id, true)} className="press rounded-full bg-inc px-3 py-1.5 text-xs font-semibold text-on-inc">
                    Cobrado
                  </button>
                </li>
              );
            })}
          </ul>
          {p.items.length > 1 && (
            <button
              onClick={() => p.items.forEach((s) => settleSplit(s.id, true))}
              className="press w-full border-t border-line py-3 text-sm font-medium text-accent2"
            >
              Me pagó todo
            </button>
          )}
        </section>
      ))}

      {!needsMigration && !pending.length && (
        <div className="rise grid justify-items-center gap-2 px-6 py-6 text-center text-sm text-muted">
          <p>Para dividir, tocá <b className="text-fg">Dividir</b> al anotar un gasto con el botón +, o al cargar una compra con tarjeta.</p>
          <button onClick={() => openSheet()} className="press mt-1 rounded-full bg-surface px-4 py-2 font-medium text-fg">
            Anotar un gasto
          </button>
        </div>
      )}

      {settled.length > 0 && (
        <section className="rise">
          <button onClick={() => setShowHistory((v) => !v)} className="px-1 text-sm font-semibold">
            Ya cobrado {showHistory ? "▾" : "▸"}
          </button>
          {showHistory && (
            <ul className="glass mt-2 divide-y divide-line overflow-hidden rounded-3xl">
              {settled.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <b className="font-medium">{s.name}</b> · <span className="text-muted">{originOf(s).label}</span>
                  </span>
                  <span className="num text-muted">{money(s.amount)}</span>
                  <button onClick={() => settleSplit(s.id, false)} className="text-xs font-medium text-muted underline">
                    Deshacer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
