"use client";

import { useStore } from "@/lib/store";
import { addMonths, currentMonth, monthLabelCompact } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "./Icons";

export function MonthSwitcher() {
  const { month, setMonth } = useStore();
  const isNow = month === currentMonth();
  return (
    <div className="flex shrink-0 items-center rounded-full bg-surface p-0.5">
      <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior" className="press grid size-9 place-items-center rounded-full">
        <ChevronLeft width={18} height={18} />
      </button>
      <button
        onClick={() => setMonth(currentMonth())}
        className="min-w-[5.5rem] whitespace-nowrap px-1 text-center text-sm font-semibold"
        aria-label="Ir al mes actual"
      >
        {monthLabelCompact(month)}
      </button>
      <button
        onClick={() => setMonth(addMonths(month, 1))}
        disabled={isNow}
        aria-label="Mes siguiente"
        className="press grid size-9 place-items-center rounded-full disabled:opacity-25"
      >
        <ChevronRight width={18} height={18} />
      </button>
    </div>
  );
}
