"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { currentMonth, dueDate, money, parseAmount, todayISO } from "@/lib/format";
import type { Kind, Recurring } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/PageHeader";
import { usePrelaunch } from "@/components/LaunchGate";
import { PlusIcon, TrashIcon } from "@/components/Icons";

export default function Fijos() {
  const { recurring, categories, saveRecurring, txs, month } = useStore();
  const prelaunch = usePrelaunch();
  const isCurrent = month === currentMonth() && !prelaunch;
  const applied = new Set(txs.filter((t) => t.period === month).map((t) => t.recurring_id));
  const [editing, setEditing] = useState<Partial<Recurring> | null>(null);

  const totals = (kind: Kind) =>
    recurring.filter((r) => r.kind === kind && r.active).reduce((a, r) => a + r.amount, 0);

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Fijos"
        subtitle="Se cargan solos cada mes, el día que elijas: sueldo, beca, alquiler, suscripciones…"
      />

      {(["income", "expense"] as const).map((kind) => {
        const items = recurring.filter((r) => r.kind === kind);
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
                        <span className="text-2xl">{cat?.emoji ?? "🔁"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="text-xs text-muted">
                            Día {r.day} de cada mes
                            {prelaunch && r.active
                              ? " · arranca en octubre"
                              : !r.active
                              ? " · pausado"
                              : isCurrent && applied.has(r.id)
                                ? " · ✓ cargado este mes"
                                : isCurrent && dueDate(month, r.day) > todayISO()
                                  ? " · pendiente"
                                  : ""}
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

function RecurringForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<Recurring>;
  onClose: () => void;
  onSave: (r: Partial<Recurring> & Pick<Recurring, "kind" | "name" | "amount">) => Promise<void>;
}) {
  const { categories, deleteRecurring } = useStore();
  const kind = (initial.kind ?? "expense") as Kind;
  const [name, setName] = useState(initial.name ?? "");
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount).replace(".", ",") : "");
  const [day, setDay] = useState(String(initial.day ?? 1));
  const [catId, setCatId] = useState(initial.category_id ?? "");
  const [active, setActive] = useState(initial.active ?? true);
  const [busy, setBusy] = useState(false);

  const amountNum = parseAmount(amount);
  const valid = name.trim() && amountNum > 0 && Number(day) >= 1 && Number(day) <= 31;
  const field = "rounded-xl border border-line bg-inset px-4 py-3 outline-none focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title={`${initial.id ? "Editar" : "Nuevo"} ${kind === "income" ? "ingreso" : "gasto"} fijo`}>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          await onSave({ ...initial, kind, name, amount: amountNum, day: Number(day), category_id: catId || null, active });
        }}
      >
        <label className="grid gap-1 text-sm text-muted">
          Nombre
          <input className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={kind === "income" ? "Sueldo, Beca…" : "Alquiler, Spotify…"} autoFocus={!initial.id} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm text-muted">
            Monto
            <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ej: 85.000" />
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Día del mes
            <input className={field} type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1 text-sm text-muted">
          Categoría
          <select className={field} value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categories.filter((c) => c.kind === kind).map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between rounded-xl bg-inset px-4 py-3 text-sm">
          Activo (se carga cada mes)
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--accent-2)]" />
        </label>
        <div className="mt-1 flex gap-2">
          {initial.id && (
            <button
              type="button"
              onClick={async () => {
                if (confirm("¿Borrar este fijo? Los movimientos ya cargados se mantienen.")) {
                  await deleteRecurring(initial.id!);
                  onClose();
                }
              }}
              aria-label="Borrar"
              className="press grid size-13 place-items-center rounded-2xl bg-surface text-exp"
            >
              <TrashIcon width={20} height={20} />
            </button>
          )}
          <button disabled={!valid || busy} className="press flex-1 rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink disabled:opacity-40">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
