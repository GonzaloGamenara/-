import type { CatSlice } from "@/lib/stats";
import { compact } from "@/lib/format";

/** Dona por categoría, dibujada con SVG (sin librerías). */
export function Donut({ slices, size = 168, center }: { slices: CatSlice[]; size?: number; center?: React.ReactNode }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const gap = slices.length > 1 ? 1.2 : 0;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="13" />
        {slices.map((s, i) => {
          const len = Math.max(s.share * c - gap, 0.5);
          const el = (
            <circle
              key={s.id ?? `none-${i}`}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              style={{ transition: "stroke-dasharray .6s ease" }}
            />
          );
          offset += s.share * c;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  );
}

/** Barras de gasto por día del mes; resalta hoy y atenúa los días que faltan. */
export function DayBars({ values, today, height = 64 }: { values: number[]; today?: number; height?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label="Gasto por día del mes">
      {values.map((v, i) => {
        const isToday = today === i + 1;
        const future = today !== undefined && i + 1 > today;
        if (v <= 0) {
          return (
            <div key={i} className="flex-1" title={`Día ${i + 1}: sin gastos`}>
              <div className="mx-auto size-[3px] rounded-full bg-fg" style={{ opacity: future ? 0.12 : 0.3 }} />
            </div>
          );
        }
        return (
          <div
            key={i}
            className="flex-1 rounded-t-[4px] rounded-b-[2px]"
            title={`Día ${i + 1}: ${compact(v)}`}
            style={{
              height: `${Math.max((v / max) * 100, 10)}%`,
              background: isToday ? "var(--accent)" : "var(--fg)",
              opacity: isToday ? 1 : 0.6,
              transition: "height .5s ease",
            }}
          />
        );
      })}
    </div>
  );
}
