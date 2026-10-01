"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { Category, Kind } from "@/lib/types";
import { CategoryForm, CATEGORY_COLORS } from "./CategoryForm";

/** Grilla horizontal de categorías, las más usadas primero. */
export function CategoryChips({
  kind,
  value,
  onChange,
}: {
  kind: Kind;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { categories, txs, prevTxs, saveCategory } = useStore();
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Category> | null>(null);
  const ordered = useMemo(() => {
    const uses = new Map<string, number>();
    for (const t of [...txs, ...prevTxs]) if (t.category_id) uses.set(t.category_id, (uses.get(t.category_id) ?? 0) + 1);
    return categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.sort - b.sort);
  }, [categories, txs, prevTxs, kind]);

  return (
    <div className="hide-scroll -mx-5 overflow-x-auto px-5">
      <div className="grid auto-cols-[92px] grid-flow-col grid-rows-2 gap-2">
        {ordered.map((c) => {
          const on = c.id === value;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => (editMode ? setForm(c) : onChange(on ? null : c.id))}
              aria-pressed={on}
              className={`press relative flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 text-[11px] font-medium leading-tight ${
                on && !editMode ? "border-transparent text-black" : editMode ? "border-dashed border-fg/30 bg-inset text-fg" : "border-line bg-inset text-fg"
              }`}
              style={on && !editMode ? { background: c.color } : undefined}
            >
              {editMode && <span className="absolute right-1.5 top-1 text-[10px] opacity-70">✎</span>}
              <span className="text-xl">{c.emoji}</span>
              <span className="line-clamp-2 min-h-[2.5em] w-full text-center leading-[1.25] [overflow-wrap:normal] [word-break:keep-all]">
                {c.name}
              </span>
            </button>
          );
        })}
        {/* Crear y editar sin salir de la carga */}
        <button
          type="button"
          onClick={() => setForm({ kind, emoji: "🏷️", color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] })}
          className="press flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-dashed border-fg/30 px-1 py-2 text-[11px] font-semibold text-accent2"
        >
          <span className="text-xl">＋</span>
          Nueva
        </button>
        {ordered.length > 0 && (
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
            className={`press flex flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-[11px] font-semibold ${
              editMode ? "bg-fg text-bg" : "border border-dashed border-fg/30 text-muted"
            }`}
          >
            <span className="text-xl">{editMode ? "✓" : "✎"}</span>
            {editMode ? "Listo" : "Editar"}
          </button>
        )}
      </div>
      {editMode && <p className="mt-2 text-xs text-muted">Tocá una categoría para cambiarle el nombre, el emoji o el color.</p>}
      {form && (
        <CategoryForm
          initial={form}
          onClose={() => setForm(null)}
          onSave={async (c) => {
            const id = await saveCategory(c);
            if (!id) return;
            setForm(null);
            // La nueva queda elegida para lo que estás cargando
            if (!c.id) {
              onChange(id);
              setEditMode(false);
            }
          }}
        />
      )}
    </div>
  );
}
