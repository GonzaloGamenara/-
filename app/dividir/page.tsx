"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useShared } from "@/lib/sharedStore";
import { groupBalances } from "@/lib/shared";
import { dayLabel, money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { debtMessage, shareText } from "@/lib/share";
import type { Split } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { AliasField } from "@/components/AliasField";
import { NewGroupSheet } from "@/components/NewGroupSheet";
import { ChevronRight, PlusIcon } from "@/components/Icons";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Dividir />
    </Suspense>
  );
}

function Dividir() {
  const params = useSearchParams();
  const { groups, members, expenses, payments, missing, ready } = useShared();
  const [creating, setCreating] = useState(params.get("nueva") === "1");

  const rows = useMemo(
    () =>
      groups.map((g) => {
        const ms = members.filter((m) => m.group_id === g.id);
        const me = ms.find((m) => m.is_me);
        const b = groupBalances(ms, expenses.filter((e) => e.group_id === g.id), payments.filter((p) => p.group_id === g.id));
        return { g, people: ms.length, total: b.total, mine: me ? (b.net.get(me.id) ?? 0) : 0, pending: b.transfers.length };
      }),
    [groups, members, expenses, payments],
  );

  return (
    <div className="grid gap-5">
      <PageHeader title="Dividir" subtitle="Cada uno carga lo que pagó y la app te dice quién le debe a quién." />

      {missing ? (
        <div className="glass rounded-3xl border-l-4 border-l-exp p-4 text-sm">
          <b>Falta un paso en Supabase.</b>
          <p className="mt-1 text-muted">
            Corré <code className="text-fg">supabase/migrations/003_cuentas_compartidas.sql</code> en SQL Editor → Run y recargá la app.
          </p>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="press rise flex items-center justify-center gap-2 rounded-3xl bg-accent2 py-4 text-base font-semibold text-black"
        >
          <PlusIcon width={18} height={18} /> Nueva cuenta compartida
        </button>
      )}

      {!ready ? (
        <div className="skeleton h-24" />
      ) : (
        rows.length > 0 && (
          <ul className="glass rise divide-y divide-line overflow-hidden rounded-3xl">
            {rows.map(({ g, people, total, mine, pending }) => (
              <li key={g.id}>
                <Link href={`/dividir/${g.id}`} className="press flex items-center gap-3 px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
                    <span className="block text-xs capitalize text-muted">
                      {dayLabel(g.occurred_on)} · {people} personas · {money(total)}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    {pending === 0 ? (
                      <span className="text-muted">{total > 0 ? "Saldada ✓" : "Sin gastos"}</span>
                    ) : mine > 0.5 ? (
                      <span className="font-semibold text-inc">Te deben {money(mine)}</span>
                    ) : mine < -0.5 ? (
                      <span className="font-semibold text-exp">Debés {money(-mine)}</span>
                    ) : (
                      <span className="text-muted">Estás al día</span>
                    )}
                  </span>
                  <ChevronRight width={16} height={16} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )
      )}

      {ready && !missing && rows.length === 0 && (
        <section className="glass rise grid gap-2 rounded-3xl p-5 text-sm">
          <h2 className="font-semibold">¿Cómo funciona?</h2>
          <ol className="grid list-decimal gap-1.5 pl-5 text-muted">
            <li>Creás la cuenta (ej: “Asado del sábado”) y sumás a los que estuvieron.</li>
            <li>Cargás lo que pagó cada uno: “Pedro · $15.000 · carne”, “Vos · $3.000 · pan”.</li>
            <li>La app calcula cuánto le toca a cada uno y quién le tiene que pasar plata a quién.</li>
            <li>Le pedís con tu alias por WhatsApp y marcás cuando te pagan.</li>
          </ol>
        </section>
      )}

      <section className="glass rise rounded-3xl p-4">
        <AliasField />
      </section>

      <LegacySplits />

      {creating && <NewGroupSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

/** Divisiones hechas con la versión anterior (compras con tarjeta divididas, etc.). */
function LegacySplits() {
  const { splits, purchases, settleSplit, alias } = useStore();
  const [origins, setOrigins] = useState<Record<string, string>>({});
  const pending = splits.filter((s) => !s.settled_on);

  useEffect(() => {
    const ids = [...new Set(pending.map((s) => s.transaction_id).filter((x): x is string => !!x))].filter((id) => !origins[id]);
    if (!ids.length) return;
    supabase()
      .from("transactions")
      .select("id,note")
      .in("id", ids)
      .then(({ data }) => data && setOrigins((o) => ({ ...o, ...Object.fromEntries(data.map((t) => [t.id, t.note || "Gasto"])) })));
  }, [pending, origins]);

  if (!pending.length) return null;
  const label = (s: Split) =>
    s.purchase_id ? (purchases.find((p) => p.id === s.purchase_id)?.description ?? "Compra con tarjeta") : (origins[s.transaction_id ?? ""] ?? "…");

  return (
    <section className="rise">
      <h2 className="mb-1 px-1 text-sm font-semibold">Compras que dividiste</h2>
      <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
        {pending.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                <b className="font-medium">{s.name}</b> te debe {money(s.amount)}
              </span>
              <span className="block truncate text-xs text-muted">{label(s)}</span>
            </span>
            <button onClick={() => shareText(debtMessage(s.name, [{ label: label(s), amount: s.amount }], alias))} className="press rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-black">
              Pedir
            </button>
            <button onClick={() => settleSplit(s.id, true)} className="press rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
              ✓
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
