import { parseISO, toISO } from "./format";

export type DayKind = "carga" | "sin_gastos";
export type StreakStatus = "activa" | "riesgo" | "apagado";

/** Hitos que se festejan con un aviso */
export const MILESTONES = [7, 30, 100, 365];

export const addDays = (iso: string, n: number) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

/** Días seguidos que terminan en `end` (incluido) */
function runEndingAt(days: Set<string>, end: string) {
  let n = 0;
  for (let d = end; days.has(d); d = addDays(d, -1)) n++;
  return n;
}

/**
 * Estado de la racha a `today`:
 * - activa: hoy ya cargaste (o marcaste que no gastaste)
 * - riesgo: hoy todavía no, pero ayer sí; la racha sigue viva hasta que termine el día
 * - apagado: ni hoy ni ayer
 */
export function streakOf(days: Set<string>, today: string) {
  const todayDone = days.has(today);
  const yesterday = addDays(today, -1);
  const current = todayDone ? runEndingAt(days, today) : runEndingAt(days, yesterday);
  const status: StreakStatus = todayDone ? "activa" : current > 0 ? "riesgo" : "apagado";

  // Récord: el tramo más largo (se cuenta desde el primer día de cada tramo)
  let best = 0;
  for (const d of days) if (!days.has(addDays(d, -1))) best = Math.max(best, countForward(days, d));
  return { current, best: Math.max(best, current), status, todayDone, total: days.size };
}

function countForward(days: Set<string>, start: string) {
  let n = 0;
  for (let d = start; days.has(d); d = addDays(d, 1)) n++;
  return n;
}

/** Semanas (lunes a domingo) que terminan en la semana de `today`, para el calendario */
export function calendarWeeks(today: string, weeks: number) {
  const d = parseISO(today);
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  const lastMonday = addDays(today, -(iso - 1));
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(firstMonday, w * 7 + i)));
}
