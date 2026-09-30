/**
 * La cuenta empieza en esta fecha (00:00 hora local del dispositivo).
 * Antes de eso la app queda en "modo preparación": se pueden armar fijos y categorías,
 * pero no se carga, genera ni calcula nada. Se cambia con NEXT_PUBLIC_LAUNCH_DATE=YYYY-MM-DD.
 */
export const LAUNCH_DATE = process.env.NEXT_PUBLIC_LAUNCH_DATE || "2026-10-01";

export function launchTime() {
  const [y, m, d] = LAUNCH_DATE.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
export const isPrelaunch = () => Date.now() < launchTime();
export const launchMonth = () => LAUNCH_DATE.slice(0, 7);
