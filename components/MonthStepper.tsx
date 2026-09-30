"use client";

import { addMonths, monthLabelCompact } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "./Icons";

export function MonthStepper({ value, onChange, min }: { value: string; onChange: (ym: string) => void; min?: string }) {
  const canPrev = !min || addMonths(value, -1) >= min;
  return (
    <div className="inline-flex items-center rounded-full bg-inset p-0.5">
      <button type="button" disabled={!canPrev} onClick={() => onChange(addMonths(value, -1))} aria-label="Mes anterior" className="press grid size-8 place-items-center rounded-full disabled:opacity-25">
        <ChevronLeft width={16} height={16} />
      </button>
      <span className="min-w-[5.5rem] text-center text-sm font-semibold">{monthLabelCompact(value)}</span>
      <button type="button" onClick={() => onChange(addMonths(value, 1))} aria-label="Mes siguiente" className="press grid size-8 place-items-center rounded-full">
        <ChevronRight width={16} height={16} />
      </button>
    </div>
  );
}
