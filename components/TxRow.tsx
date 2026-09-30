"use client";

import { useStore } from "@/lib/store";
import { money } from "@/lib/format";
import type { Transaction } from "@/lib/types";

export function TxRow({ tx }: { tx: Transaction }) {
  const { categories, openSheet } = useStore();
  const cat = categories.find((c) => c.id === tx.category_id);
  const isExp = tx.kind === "expense";
  return (
    <button
      onClick={() => openSheet({ editing: tx })}
      className="press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-surface"
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-2xl text-xl"
        style={{ background: `color-mix(in srgb, ${cat?.color ?? "#64748b"} 22%, transparent)` }}
      >
        {cat?.emoji ?? "❔"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{tx.note || cat?.name || "Sin categoría"}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {cat?.name ?? "Sin categoría"}
          {tx.recurring_id && <span className="rounded-full bg-surface px-1.5 py-px text-[10px]">fijo</span>}
          {tx.pending && <span className="rounded-full bg-surface px-1.5 py-px text-[10px]">sin subir</span>}
        </span>
      </span>
      <span className={`num shrink-0 text-[15px] font-semibold ${isExp ? "" : "text-inc"}`}>
        {isExp ? "−" : "+"}
        {money(tx.amount)}
      </span>
    </button>
  );
}
