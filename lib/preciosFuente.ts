/**
 * Lectura tolerante de las cotizaciones públicas que usa /api/precios.
 * Si un campo no viene o cambia de nombre, se descarta esa cotización en vez de romper todo.
 */

export interface Quote {
  /** Último precio en pesos por nominal */
  price: number;
  /** Variación del día en % (si la fuente la informa) */
  change: number | null;
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Panel de data912 (arg_cedears / arg_stocks): [{ symbol, c, px_bid, px_ask, pct_change, ... }] */
export function parsePanel(data: unknown): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  if (!Array.isArray(data)) return out;
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const symbol = typeof r.symbol === "string" ? r.symbol.trim().toUpperCase() : null;
    if (!symbol) continue;
    const last = num(r.c) ?? num(r.last) ?? num(r.price);
    const bid = num(r.px_bid);
    const ask = num(r.px_ask);
    const price = last && last > 0 ? last : bid && ask && bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
    if (!price) continue;
    out[symbol] = { price, change: num(r.pct_change) };
  }
  return out;
}

/** Dólar MEP: dolarapi ({ venta }) o ArgentinaDatos ([{ venta, fecha }]) */
export function parseMep(data: unknown): number | null {
  const pick = Array.isArray(data) ? data[data.length - 1] : data;
  if (!pick || typeof pick !== "object") return null;
  const v = num((pick as Record<string, unknown>).venta);
  return v && v > 0 ? v : null;
}
