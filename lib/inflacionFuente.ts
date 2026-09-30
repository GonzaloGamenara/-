/** Interpreta la serie de inflación mensual (INDEC vía ArgentinaDatos): [{ fecha, valor }] en %. */
export function ultimoDato(raw: unknown): { valor: number; fecha: string; promedio3: number } | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .map((r) => {
      const o = r as Record<string, unknown>;
      const valor = Number(o.valor ?? o.value);
      const fecha = String(o.fecha ?? o.date ?? "");
      return Number.isFinite(valor) && /^\d{4}-\d{2}/.test(fecha) ? { valor, fecha: fecha.slice(0, 10) } : null;
    })
    .filter((x): x is { valor: number; fecha: string } => !!x && x.valor > -10 && x.valor < 100)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const tail = rows.slice(-3);
  return { valor: last.valor, fecha: last.fecha, promedio3: tail.reduce((a, r) => a + r.valor, 0) / tail.length };
}
