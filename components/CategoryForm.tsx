"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { Category, Kind } from "@/lib/types";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";

export const CATEGORY_EMOJIS = ["🛒", "🍔", "☕", "🍕", "🚌", "🚗", "⛽", "🏠", "💡", "📱", "📺", "🎮", "💊", "🏥", "📚", "🎓", "👕", "👟", "🎉", "🍻", "🎁", "✈️", "🐶", "💇", "🏋️", "💼", "💰", "🏷️", "🧩", "✨"];
export const CATEGORY_COLORS = ["#34d399", "#4ade80", "#a3e635", "#facc15", "#fb923c", "#f87171", "#fb7185", "#f472b6", "#c084fc", "#a78bfa", "#60a5fa", "#22d3ee", "#2dd4bf", "#94a3b8"];

/** Crear o editar una categoría (nombre, emoji y color). */
export function CategoryForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<Category>;
  onClose: () => void;
  onSave: (c: Partial<Category> & Pick<Category, "kind" | "name">) => Promise<unknown>;
}) {
  const { deleteCategory } = useStore();
  const kind = (initial.kind ?? "expense") as Kind;
  const [name, setName] = useState(initial.name ?? "");
  const [emoji, setEmoji] = useState(initial.emoji ?? "🏷️");
  const [color, setColor] = useState(initial.color ?? CATEGORY_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg outline-none placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title={initial.id ? "Editar categoría" : kind === "income" ? "Nueva categoría de ingreso" : "Nueva categoría de gasto"}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          await onSave({ ...initial, kind, name, emoji, color });
          setBusy(false);
        }}
      >
        <div className="grid grid-cols-[72px_1fr] gap-3">
          <div className="grid place-items-center rounded-xl border border-line text-3xl" style={{ background: `color-mix(in srgb, ${color} 25%, transparent)` }} aria-hidden>
            {emoji}
          </div>
          <input className={field} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" maxLength={24} />
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
          {CATEGORY_EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setEmoji(e)}
              aria-label={e}
              className={`press grid aspect-square place-items-center rounded-xl text-xl ${emoji === e ? "bg-fg/15 ring-2 ring-accent2" : "bg-inset"}`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className={`size-9 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {initial.id && (
            <button
              type="button"
              onClick={async () => {
                if (confirm("¿Borrar categoría? Sus movimientos quedan como “Sin categoría”.")) {
                  await deleteCategory(initial.id!);
                  onClose();
                }
              }}
              aria-label="Borrar"
              className="press grid size-[3.25rem] shrink-0 place-items-center rounded-2xl bg-inset text-exp"
            >
              <TrashIcon width={20} height={20} />
            </button>
          )}
          <button disabled={!name.trim() || busy} className="press flex-1 rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink disabled:opacity-40">
            {busy ? "Guardando…" : initial.id ? "Guardar" : "Crear y usar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
