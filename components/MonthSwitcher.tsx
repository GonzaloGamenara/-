"use client";

import { useStore } from "@/lib/store";
import { addMonths, currentMonth, monthLabel } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "./Icons";

export function MonthSwitcher() {
  const { month, setMonth } = useStore();
  const isNow = month === currentMonth();
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior" className="press grid size-9 place-items-center rounded-full bg-surface">
        <ChevronLeft width={18} height={18} />
      </button>
      <button
        onClick={() => setMonth(currentMonth())}
        className="min-w-32 px-2 text-center text-[15px] font-semibold"
        aria-label="Ir al mes actual"
      >
        {monthLabel(month)}
      </button>
      <button
        onClick={() => setMonth(addMonths(month, 1))}
        disabled={isNow}
        aria-label="Mes siguiente"
        className="press grid size-9 place-items-center rounded-full bg-surface disabled:opacity-30"
      >
        <ChevronRight width={18} height={18} />
      </button>
    </div>
  );
}
