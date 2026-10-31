import type { Category, Kind, Recurring, Transaction } from "./types";
import { parseISO } from "./format";

/**
 * Importación de movimientos desde un archivo JSON (por ejemplo, el que arma
 * tu agente a partir de los resúmenes del banco).
 *
 * Formato:
 * {
 *   "formato": "gastos-import-v1",
 *   "categorias": [{ "nombre": "Delivery", "emoji": "🛵", "color": "#f97316", "tipo": "expense" }],
 *   "movimientos": [
 *     { "fecha": "2026-10-08", "monto": -23565, "categoria": "Delivery", "nota": "Mi Gusto" },
 *     { "fecha": "2026-10-30", "monto": 1396150, "categoria": "Sueldo", "fijo": "sueldo" },
 *     { "fecha": "2026-10-26", "monto": -15000, "mi_parte": 5000, "categoria": "Café y antojos" }
 *   ]
 * }
 * monto negativo = gasto, positivo = ingreso. "fijo" son nombres (separados por |)
 * del gasto/ingreso fijo que ese movimiento confirma: en vez de duplicarlo, se
 * actualiza el del mes con el monto y la fecha reales.
 */
export interface ImportRow {
  fecha: string;
  monto: number;
  categoria?: string;
  nota?: string;
  fijo?: string;
  mi_parte?: number;
}

export interface ImportCategory {
  nombre: string;
  emoji?: string;
  color?: string;
  tipo?: Kind;
}

export interface ImportFile {
  categorias: ImportCategory[];
  movimientos: ImportRow[];
}

export type Action = "nuevo" | "repetido" | "fijo";

export interface PlannedRow {
  key: number;
  row: ImportRow;
  kind: Kind;
  amount: number;
  /** Categoría existente o nombre de la que se va a crear */
  category: Category | null;
  newCategory: string | null;
  action: Action;
  /** Movimiento ya cargado que coincide (repetido o el fijo del mes) */
  match: Transaction | null;
  fijoName: string | null;
  include: boolean;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Valida y normaliza el archivo; tira un Error con un mensaje entendible si no sirve */
export function parseImport(text: string): ImportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON válido");
  }
  const obj = (Array.isArray(data) ? { movimientos: data } : data) as Partial<Record<string, unknown>>;
  const raw = Array.isArray(obj.movimientos) ? obj.movimientos : null;
  if (!raw) throw new Error("No encontré la lista de “movimientos”");
  const movimientos: ImportRow[] = [];
  raw.forEach((r, i) => {
    const x = r as Partial<ImportRow>;
    const monto = Number(x.monto);
    if (!isDate(x.fecha) || !Number.isFinite(monto) || monto === 0) {
      throw new Error(`Movimiento ${i + 1}: falta la fecha (AAAA-MM-DD) o el monto`);
    }
    const mi = x.mi_parte === undefined || x.mi_parte === null ? undefined : Number(x.mi_parte);
    movimientos.push({
      fecha: x.fecha,
      monto,
      categoria: typeof x.categoria === "string" ? x.categoria.trim() : undefined,
      nota: typeof x.nota === "string" ? x.nota.trim() : undefined,
      fijo: typeof x.fijo === "string" ? x.fijo : undefined,
      mi_parte: mi !== undefined && Number.isFinite(mi) ? Math.max(0, Math.min(Math.abs(monto), mi)) : undefined,
    });
  });
  const categorias = (Array.isArray(obj.categorias) ? obj.categorias : [])
    .map((c) => c as Partial<ImportCategory>)
    .filter((c): c is ImportCategory => typeof c.nombre === "string" && !!c.nombre.trim());
  return { categorias, movimientos };
}

const daysBetween = (a: string, b: string) => Math.abs(parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000;
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol);

/** Rango de fechas a consultar para buscar repetidos */
export function importRange(file: ImportFile) {
  const dates = file.movimientos.map((m) => m.fecha).sort();
  const shift = (s: string, d: number) => {
    const t = parseISO(s);
    t.setDate(t.getDate() + d);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  return { from: shift(dates[0], -3), to: shift(dates[dates.length - 1], 3) };
}

/**
 * Decide qué hacer con cada fila:
 * - "fijo": confirma un fijo del mes (se actualiza con el monto y la fecha reales)
 * - "repetido": ya está cargado (mismo tipo, monto parecido, ±3 días) → se saltea
 * - "nuevo": se agrega
 */
export function planImport(
  file: ImportFile,
  existing: Transaction[],
  recurring: Recurring[],
  categories: Category[],
): PlannedRow[] {
  const used = new Set<string>();
  const catByName = new Map(categories.map((c) => [`${c.kind}:${norm(c.name)}`, c]));

  // Primero los que confirman un fijo, así no se los "roba" un repetido
  const order = file.movimientos.map((row, key) => ({ row, key })).sort((a, b) => Number(!a.row.fijo) - Number(!b.row.fijo));

  const planned = order.map(({ row, key }): PlannedRow => {
    const kind: Kind = row.monto < 0 ? "expense" : "income";
    const amount = Math.abs(row.monto);
    const catName = row.categoria?.trim() || null;
    const category = catName ? catByName.get(`${kind}:${norm(catName)}`) ?? null : null;
    const period = row.fecha.slice(0, 7);
    const base = { key, row, kind, amount, category, newCategory: catName && !category ? catName : null };

    // ¿Confirma un fijo? Por nombre, y con un monto razonablemente parecido
    if (row.fijo) {
      const alts = row.fijo.split("|").map(norm).filter(Boolean);
      const candidates = recurring
        .filter((r) => r.kind === kind && alts.some((a) => norm(r.name).includes(a)) && close(r.amount, amount, 0.3))
        .sort((a, b) => Math.abs(a.amount - amount) - Math.abs(b.amount - amount));
      for (const r of candidates) {
        const tx = existing.find((t) => t.recurring_id === r.id && t.period === period && !used.has(t.id));
        if (tx) {
          used.add(tx.id);
          // El fijo conserva su categoría: solo se corrigen monto y fecha
          const fijoCat = categories.find((c) => c.id === tx.category_id) ?? null;
          return { ...base, category: fijoCat, newCategory: null, action: "fijo", match: tx, fijoName: r.name, include: true };
        }
      }
    }

    // ¿Ya está cargado? (a mano o por un fijo)
    const dup = existing
      .filter(
        (t) =>
          !used.has(t.id) &&
          t.kind === kind &&
          close(Number(t.amount), amount, 0.005) &&
          daysBetween(t.occurred_on, row.fecha) <= 3,
      )
      .sort((a, b) => daysBetween(a.occurred_on, row.fecha) - daysBetween(b.occurred_on, row.fecha))[0];
    if (dup) {
      used.add(dup.id);
      return { ...base, action: "repetido", match: dup, fijoName: null, include: false };
    }
    return { ...base, action: "nuevo", match: null, fijoName: null, include: true };
  });

  return planned.sort((a, b) => b.row.fecha.localeCompare(a.row.fecha) || a.key - b.key);
}
