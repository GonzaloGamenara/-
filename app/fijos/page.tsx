"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { currentMonth, dueDate, money, todayISO } from "@/lib/format";
import type { Kind, Recurring } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { CuentasTabs } from "@/components/CuentasTabs";
import { usePrelaunch } from "@/components/LaunchGate";
import { PlusIcon } from "@/components/Icons";
import { RecurringForm } from "@/components/RecurringForm";

export default function Fijos() {
  const { recurring, categories, saveRecurring, txs, month } = useStore();
  const prelaunch = usePrelaunch();
  const isCurrent = month === currentMonth() && !prelaunch;
  const applied = new Set(txs.filter((t) => t.period === month).map((t) => t.recurring_id));
  const [editing, setEditing] = useState<Partial<Recurring> | null>(null);

  // Las suscripciones con tarjeta viven en Tarjetas
  const own = recurring.filter((r) => !r.card_id);
  const totals = (kind: Kind) =>
    own.filter((r) => r.kind === kind && r.active).reduce((a, r) => a + r.amount, 0);

  return (
    <div className="grid gap-5">
      <CuentasTabs />
      <PageHeader title="Fijos" subtitle="Se cargan solos cada mes, el día que elijas: sueldo, beca, alquiler, servicios…" />

      {(["income", "expense"] as const).map((kind) => {
        const items = own.filter((r) => r.kind === kind);
        return (
          <section key={kind} className="rise">
            <div className="mb-2 flex items-end justify-between px-1">
              <div>
                <h2 className="text-sm font-semibold">{kind === "income" ? "Ingresos fijos" : "Gastos fijos"}</h2>
                <p className="num text-2xl font-semibold">{money(totals(kind))}<span className="ml-1 text-xs font-normal text-muted">/ mes</span></p>
              </div>
              <button
                onClick={() => setEditing({ kind, day: 1, active: true })}
                className="press flex items-center gap-1 rounded-full bg-surface px-3.5 py-2 text-sm font-medium"
              >
                <PlusIcon width={16} height={16} /> Agregar
              </button>
            </div>
            {items.length === 0 ? (
              <p className="glass rounded-3xl p-5 text-center text-sm text-muted">Todavía no cargaste ninguno.</p>
            ) : (
              <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
                {items.map((r) => {
                  const cat = categories.find((c) => c.id === r.category_id);
                  return (
                    <li key={r.id} className={r.active ? "" : "opacity-45"}>
                      <button onClick={() => setEditing(r)} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
                        <span
                          className="grid size-11 shrink-0 place-items-center rounded-2xl text-xl"
                          style={{ background: `color-mix(in srgb, ${cat?.color ?? "#64748b"} 22%, transparent)` }}
                        >
                          {cat?.emoji ?? "🔁"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            Día {r.day}
                            <Status
                              label={
                                !r.active
                                  ? "Pausado"
                                  : prelaunch
                                    ? "Desde octubre"
                                    : isCurrent && applied.has(r.id)
                                      ? "✓ Este mes"
                                      : isCurrent && dueDate(month, r.day) > todayISO()
                                        ? "Pendiente"
                                        : null
                              }
                            />
                          </span>
                        </span>
                        <span className={`num font-semibold ${r.kind === "income" ? "text-inc" : ""}`}>{money(r.amount)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {editing && (
        <RecurringForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await saveRecurring(r);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Status({ label }: { label: string | null }) {
  if (!label) return null;
  return <span className="rounded-full bg-inset px-2 py-0.5 text-[11px] font-medium leading-none text-fg/80">{label}</span>;
}
