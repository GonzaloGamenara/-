import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de solo lectura para la API del agente: imita lo poco que usa el export de Supabase
 * (from → select → filtros → orden → límite) sobre filas que ya trajo la función agent_read.
 * Así el export es el mismo en el navegador y en el servidor, sin claves maestras.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const cmp = (a: unknown, b: unknown) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const [x, y] = [String(a), String(b)];
  // Números guardados como texto (numeric de Postgres)
  if (!Number.isNaN(Number(x)) && !Number.isNaN(Number(y)) && x.trim() !== "" && y.trim() !== "") return Number(x) - Number(y);
  return x < y ? -1 : x > y ? 1 : 0;
};

function query(load: () => Promise<Row[]>) {
  const filters: Filter[] = [];
  const orders: { col: string; asc: boolean }[] = [];
  let max: number | null = null;
  let single = false;
  const run = async () => {
    try {
      let rows = (await load()).filter((r) => filters.every((f) => f(r)));
      if (orders.length)
        rows = [...rows].sort((a, b) => {
          for (const o of orders) {
            const c = cmp(a[o.col], b[o.col]);
            if (c) return o.asc ? c : -c;
          }
          return 0;
        });
      if (max !== null) rows = rows.slice(0, max);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error)?.message ?? String(e) } };
    }
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => String(r[c]) === String(v)), q),
    neq: (c: string, v: unknown) => (filters.push((r) => String(r[c]) !== String(v)), q),
    gt: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) > 0), q),
    gte: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) >= 0), q),
    lt: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) < 0), q),
    lte: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) <= 0), q),
    is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), q),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.map(String).includes(String(r[c]))), q),
    not: (c: string, op: string, v: unknown) => {
      if (op === "is") filters.push((r) => (v === null || v === "null" ? r[c] != null : r[c] !== v));
      else if (op === "eq") filters.push((r) => String(r[c]) !== String(v));
      return q;
    },
    order: (col: string, o?: { ascending?: boolean }) => (orders.push({ col, asc: o?.ascending !== false }), q),
    limit: (n: number) => ((max = n), q),
    single: () => ((single = true), q),
    maybeSingle: () => ((single = true), q),
    then: <T>(ok: (v: Awaited<ReturnType<typeof run>>) => T, ko?: (e: unknown) => T) => run().then(ok, ko),
  };
  return q;
}

/** `loadTable` trae todas las filas de una tabla (una vez por pedido; se reutiliza) */
export function readOnlyDb(loadTable: (table: string) => Promise<Row[]>): SupabaseClient {
  const cache = new Map<string, Promise<Row[]>>();
  const load = (t: string) => {
    if (!cache.has(t)) cache.set(t, loadTable(t));
    return cache.get(t)!;
  };
  return { from: (t: string) => query(() => load(t)) } as unknown as SupabaseClient;
}
