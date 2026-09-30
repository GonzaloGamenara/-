"use client";

import { useState } from "react";
import { useShared } from "@/lib/sharedStore";
import { money, parseAmount } from "@/lib/format";
import type { SharedExpense, SharedMember } from "@/lib/shared";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";

const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);

/** Cargar lo que pagó alguien: quién, cuánto, en qué y entre quiénes se reparte. */
export function SharedExpenseSheet({
  groupId,
  members,
  initial,
  onClose,
}: {
  groupId: string;
  members: SharedMember[];
  initial?: SharedExpense | null;
  onClose: () => void;
}) {
  const { saveExpense, deleteExpense } = useShared();
  const me = members.find((m) => m.is_me);
  const [payer, setPayer] = useState(initial?.payer_id ?? me?.id ?? members[0]?.id);
  const [amountRaw, setAmountRaw] = useState(initial ? fmt(initial.amount) : "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [among, setAmong] = useState<string[]>(initial?.among?.length ? initial.among : members.map((m) => m.id));
  const [busy, setBusy] = useState(false);

  const amount = parseAmount(amountRaw);
  const valid = amount > 0 && !!payer && among.length > 0;
  const toggle = (id: string) => setAmong((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const who = (m: SharedMember) => (m.is_me ? "Vos" : m.name);

  return (
    <Sheet open onClose={onClose} title={initial ? "Editar gasto" : "¿Quién pagó qué?"}>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <span className="text-sm text-muted">Pagó</span>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPayer(m.id)}
                className={`press rounded-full px-4 py-2 text-sm font-semibold ${payer === m.id ? "bg-fg text-bg" : "bg-inset text-muted"}`}
              >
                {who(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
          <label className="grid gap-1.5 text-sm text-muted">
            Cuánto
            <input
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              inputMode="decimal"
              placeholder="$ 0"
              autoFocus={!initial}
              className="num w-full rounded-xl border border-line bg-inset px-4 py-3 text-lg font-semibold text-fg placeholder:text-muted/60 focus:border-accent2"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-muted">
            En qué
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Carne, pan, bebida…"
              maxLength={50}
              className="w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg placeholder:text-muted/60 focus:border-accent2"
            />
          </label>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Se reparte entre</span>
            {among.length > 0 && amount > 0 && <span className="num">{money(amount / among.length)} c/u</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = among.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  className={`press rounded-full px-4 py-2 text-sm font-semibold ${on ? "bg-accent2 text-black" : "bg-inset text-muted line-through"}`}
                >
                  {who(m)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">Destildá a quien no participó de este gasto (ej: no tomó bebida).</p>
        </div>

        <div className="flex gap-2">
          {initial && (
            <button
              type="button"
              aria-label="Borrar gasto"
              onClick={async () => {
                if (confirm("¿Borrar este gasto?")) {
                  await deleteExpense(initial.id);
                  onClose();
                }
              }}
              className="press grid size-[3.25rem] shrink-0 place-items-center rounded-2xl bg-inset text-exp"
            >
              <TrashIcon width={20} height={20} />
            </button>
          )}
          <button
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await saveExpense({
                id: initial?.id,
                group_id: groupId,
                payer_id: payer!,
                amount,
                description: desc,
                among: among.length === members.length ? null : among,
              });
              setBusy(false);
              if (ok) onClose();
            }}
            className="press flex-1 rounded-2xl bg-accent2 py-4 font-semibold text-black disabled:opacity-35"
          >
            {busy ? "Guardando…" : initial ? "Guardar cambios" : "Agregar gasto"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
