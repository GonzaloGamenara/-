"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { parseAmount } from "@/lib/format";
import type { Kind, Recurring } from "@/lib/types";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";

/** Alta/edición de un fijo mensual. Con `card_id`, es una suscripción cobrada en esa tarjeta. */
export function RecurringForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<Recurring>;
  onClose: () => void;
  onSave: (r: Partial<Recurring> & Pick<Recurring, "kind" | "name" | "amount">) => Promise<void>;
}) {
  const { categories, cards, deleteRecurring } = useStore();
  const kind = (initial.kind ?? "expense") as Kind;
  // Un gasto fijo se puede pagar con tarjeta: en ese caso es una suscripción de esa tarjeta
  const [cardId, setCardId] = useState<string | null>(initial.card_id ?? null);
  const card = cardId ? cards.find((c) => c.id === cardId) : undefined;
  const [name, setName] = useState(initial.name ?? "");
  const [amount, setAmount] = useState(initial.amount ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(initial.amount) : "");
  const [day, setDay] = useState(String(initial.day ?? 1));
  const [catId, setCatId] = useState(initial.category_id ?? "");
  const [active, setActive] = useState(initial.active ?? true);
  const [busy, setBusy] = useState(false);

  const amountNum = parseAmount(amount);
  const valid = name.trim() && amountNum > 0 && Number(day) >= 1 && Number(day) <= 31;
  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg outline-none placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet
      open
      onClose={onClose}
      title={card ? `${initial.id ? "Editar" : "Nueva"} suscripción` : `${initial.id ? "Editar" : "Nuevo"} ${kind === "income" ? "ingreso" : "gasto"} fijo`}
    >

      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          await onSave({ ...initial, kind, name, amount: amountNum, day: Number(day), category_id: catId || null, active, card_id: kind === "expense" ? cardId : null });
        }}
      >
        <label className="grid gap-1 text-sm text-muted">
          Nombre
          <input className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={card ? "Spotify, Netflix, iCloud…" : kind === "income" ? "Sueldo, Beca…" : "Alquiler, Luz…"} />
        </label>
        {kind === "expense" && cards.length > 0 && (
          <div className="grid gap-1.5">
            <span className="text-sm text-muted">Se paga con</span>
            <div className="hide-scroll -mx-5 flex gap-1.5 overflow-x-auto px-5 text-sm">
              <button
                type="button"
                onClick={() => setCardId(null)}
                className={`press shrink-0 rounded-full px-3.5 py-1.5 font-medium ${!cardId ? "bg-fg text-bg" : "bg-inset text-muted"}`}
              >
                Efectivo / débito
              </button>
              {cards.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCardId(c.id)}
                  className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium ${cardId === c.id ? "bg-fg text-bg" : "bg-inset text-muted"}`}
                >
                  <span className="size-2 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
            {card && <p className="text-xs text-muted">Se suma al resumen de {card.name} (pago el día {card.due_day}).</p>}
          </div>
        )}
        <div className={card ? "grid" : "grid grid-cols-2 gap-3"}>
          <label className="grid gap-1 text-sm text-muted">
            Monto {card ? "por mes" : ""}
            <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ej: 85.000" />
          </label>
          {!card && (
            <label className="grid gap-1 text-sm text-muted">
              Día del mes
              <input className={field} type="text" inputMode="numeric" maxLength={2} value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ""))} />
            </label>
          )}
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
          {card ? "Activa (si la cancelás, apagala)" : "Activo (se carga cada mes)"}
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--accent-2)]" />
        </label>
        <div className="mt-1 flex gap-2">
          {initial.id && (
            <button
              type="button"
              onClick={async () => {
                if (confirm(card ? "¿Borrar esta suscripción? Lo ya cobrado se mantiene." : "¿Borrar este fijo? Los movimientos ya cargados se mantienen.")) {
                  await deleteRecurring(initial.id!);
                  onClose();
                }
              }}
              aria-label="Borrar"
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
