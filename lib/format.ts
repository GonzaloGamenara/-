const moneyFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const moneyFmtDec = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactFmt = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function money(n: number, opts: { decimals?: boolean } = {}) {
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return (opts.decimals || hasCents ? moneyFmtDec : moneyFmt).format(n).replace(/ /g, " ");
}
export const compact = (n: number) => `$${compactFmt.format(n)}`;

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha local (no UTC) en formato YYYY-MM-DD */
export function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayISO = () => toISO(new Date());
export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const currentMonth = () => todayISO().slice(0, 7);

export function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export const monthStart = (ym: string) => `${ym}-01`;
export const monthEnd = (ym: string) => `${ym}-${pad(daysInMonth(ym))}`;

export function monthLabel(ym: string, style: "long" | "short" = "long") {
  const [y, m] = ym.split("-").map(Number);
  const out = new Intl.DateTimeFormat("es-AR", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
  }).format(new Date(y, m - 1, 1));
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function dayLabel(iso: string) {
  const today = todayISO();
  const yest = toISO(new Date(Date.now() - 864e5));
  if (iso === today) return "Hoy";
  if (iso === yest) return "Ayer";
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" })
    .format(parseISO(iso))
    .replace(".", "");
}

/** Día del mes de un fijo, ajustado a meses cortos (31 → 28/30) */
export const dueDate = (ym: string, day: number) =>
  `${ym}-${pad(Math.min(day, daysInMonth(ym)))}`;

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
