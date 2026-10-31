"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useTechos, type BudgetInput } from "@/lib/techosStore";
import { DAY_LETTERS, type Budget } from "@/lib/techos";
import { parseAmount } from "@/lib/format";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";

const fmt = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n));
const opt = (s: string) => (s.trim() ? parseAmount(s) || null : null);

/** Alta/edición de un techo: una o varias categorías, mensual obligatorio y el resto opcional */
export function BudgetForm({ initial, onClose }: { initial: Partial<Budget>; onClose: () => void }) {
  const { categories } = useStore();
  const { budgets, saveBudget, deleteBudget } = useTechos();
  const [name, setName] = useState(initial.name ?? "");
  const [cats, setCats] = useState<string[]>(initial.category_ids ?? []);
  const [monthly, setMonthly] = useState(fmt(initial.monthly));
  const [weekly, setWeekly] = useState(fmt(initial.weekly));
  const [max, setMax] = useState(fmt(initial.max_per_tx));
  const [days, setDays] = useState<number[]>(initial.allowed_days ?? []);
  const [busy, setBusy] = useState(false);

  const expense = categories.filter((c) => c.kind === "expense");
  const takenBy = (id: string) => budgets.find((b) => b.id !== initial.id && b.category_ids.includes(id));
  const monthlyNum = parseAmount(monthly);
  const autoName = cats.length === 1 ? (expense.find((c) => c.id === cats[0])?.name ?? "") : "";
  const finalName = name.trim() || autoName;
  const valid = cats.length > 0 && monthlyNum > 0 && !!finalName;
  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg outline-none placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title={initial.id ? `Editar ${initial.name}` : "Nuevo techo"}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          const input: BudgetInput = {
            id: initial.id,
            name: finalName,
            category_ids: cats,
            monthly: monthlyNum,
            weekly: opt(weekly),
            max_per_tx: opt(max),
            allowed_days: days.length && days.length < 7 ? days : null,
          };
          if (await saveBudget(input)) onClose();
          else setBusy(false);
        }}
      >
        <div className="grid gap-1.5">
          <span className="text-sm text-muted">Categorías (podés agrupar varias)</span>
          <div className="flex flex-wrap gap-2">
            {expense.map((c) => {
              const on = cats.includes(c.id);
              const other = takenBy(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  disabled={!!other}
                  onClick={() => setCats((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                  className={`press flex items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-3 text-sm disabled:opacity-40 ${
                    on ? "border-transparent bg-fg text-bg" : "border-line bg-inset"
                  }`}
                >
                  {c.emoji} {c.name}
                  {other && <span className="text-[11px]">· en {other.name}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <label className="grid gap-1 text-sm text-muted">
          Nombre {cats.length > 1 ? "del grupo" : "(opcional)"}
          <input
            className={field}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={autoName || (cats.length > 1 ? "Gustos, Antojos…" : "Nombre")}
            maxLength={30}
          />
        </label>

        <label className="grid gap-1 text-sm text-muted">
          Techo mensual
          <input className={field} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="Ej: 80.000" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm text-muted">
            Techo semanal
            <input className={field} inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="Opcional" />
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Máximo por movimiento
            <input className={field} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Opcional" />
          </label>
        </div>

        <div className="grid gap-1.5">
          <span className="text-sm text-muted">Días permitidos {days.length ? "" : "(todos)"}</span>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = days.includes(d);
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  onClick={() => setDays((p) => (on ? p.filter((x) => x !== d) : [...p, d].sort()))}
                  className={`press rounded-xl py-2.5 text-sm font-semibold ${on ? "bg-fg text-bg" : "bg-inset text-muted"}`}
                >
                  {DAY_LETTERS[d]}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-muted">La semana va de lunes a domingo. Si no elegís ninguno, vale cualquier día.</span>
        </div>

        <div className="flex gap-2">
          {initial.id && (
            <button
              type="button"
              aria-label="Borrar techo"
              onClick={async () => {
                if (confirm(`¿Borrar el techo “${initial.name}”? Sus categorías vuelven a funcionar sin techo.`)) {
                  await deleteBudget(initial.id!);
                  onClose();
                }
              }}
              className="press grid size-[3.25rem] shrink-0 place-items-center rounded-2xl bg-inset text-exp"
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
