"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useShared } from "@/lib/sharedStore";
import { dayLabel, money } from "@/lib/format";
import { mine, type Transaction } from "@/lib/types";

export function TxRow({ tx, showDate = false }: { tx: Transaction; showDate?: boolean }) {
  const router = useRouter();
  const { categories, cards, purchases, openSheet, openPurchase } = useStore();
  const { groups } = useShared();
  const group = groups.find((g) => g.transaction_id === tx.id);
  const cat = categories.find((c) => c.id === tx.category_id);
  const card = tx.card_id ? cards.find((c) => c.id === tx.card_id) : undefined;
  const purchase = tx.purchase_id ? purchases.find((p) => p.id === tx.purchase_id) : undefined;
  const isExp = tx.kind === "expense";
  const my = mine(tx);
  const split = my < tx.amount - 0.005;

  return (
    <button
      onClick={() => (group ? router.push(`/dividir/${group.id}`) : purchase ? openPurchase({ purchase }) : openSheet({ editing: tx }))}
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
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted">
          <span className="truncate">
            {tx.note ? (cat?.name ?? "Sin categoría") : showDate ? dayLabel(tx.occurred_on) : "Sin nota"}
            {tx.note && showDate && ` · ${dayLabel(tx.occurred_on)}`}
          </span>
          {card && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-inset px-1.5 py-px text-[10px] text-fg/80">
              <span className="size-1.5 rounded-full" style={{ background: card.color }} />
              {tx.installment && purchase ? `${tx.installment}/${purchase.installments}` : card.name}
            </span>
          )}
          {tx.recurring_id && !card && <span className="shrink-0 rounded-full bg-inset px-1.5 py-px text-[10px]">fijo</span>}
          {(split || group) && <span className="shrink-0 rounded-full bg-inset px-1.5 py-px text-[10px]">dividido</span>}
          {tx.pending && <span className="shrink-0 rounded-full bg-inset px-1.5 py-px text-[10px]">sin subir</span>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`num block text-[15px] font-semibold ${isExp ? "" : "text-inc"}`}>
          {isExp ? "−" : "+"}
          {money(my)}
        </span>
        {split && <span className="num text-[11px] text-muted">de {money(tx.amount)}</span>}
      </span>
    </button>
  );
}
