/**
 * La app queda bloqueada hasta esta fecha (00:00 hora local del dispositivo).
 * Se puede cambiar con NEXT_PUBLIC_LAUNCH_DATE=YYYY-MM-DD; si la fecha ya pasó, no bloquea nada.
 */
export const LAUNCH_DATE = process.env.NEXT_PUBLIC_LAUNCH_DATE || "2026-10-01";

export function launchTime() {
  const [y, m, d] = LAUNCH_DATE.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
