"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import type { Kind } from "@/lib/types";

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
  const { categories, txs, prevTxs } = useStore();
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
              onClick={() => onChange(on ? null : c.id)}
              aria-pressed={on}
              className={`press flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 text-[11px] font-medium leading-tight ${
                on ? "border-transparent text-black" : "border-line bg-inset text-fg"
              }`}
              style={on ? { background: c.color } : undefined}
            >
              <span className="text-xl">{c.emoji}</span>
              <span className="line-clamp-2 min-h-[2.5em] w-full text-center leading-[1.25] [overflow-wrap:normal] [word-break:keep-all]">
                {c.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
