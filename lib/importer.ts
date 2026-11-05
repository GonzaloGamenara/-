import type { Asset, AssetKind, Card, Category, Kind, Purchase, Recurring, Transaction } from "./types";
import { addMonths, parseISO } from "./format";
import { periodForPurchase } from "./cards";

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
 *
 * Correcciones sobre lo ya cargado (opcional, en el mismo archivo o solo):
 *   "cambios": [
 *     { "buscar": { "fecha": "2026-10-01", "monto": -35000, "nota": "comision" }, "borrar": true, "motivo": "Repetido" },
 *     { "buscar": { "fecha": "2026-10-02", "monto": -16830 }, "categoria": "Delivery", "nota": "Subway" }
 *   ],
 *   "fusionar_categorias": [{ "de": "Uber", "a": "Transporte" }],
 *   "tarjetas": [{ "nombre": "Visa Galicia", "dia_de_pago": 9 }],
 *   "patrimonio": [
 *     { "nombre": "Galicia", "tipo": "cuenta", "saldo": 2722819.14 },
 *     { "nombre": "S&P 500", "tipo": "cedear", "ticker": "SPY", "nominales": 10, "precio": 20920, "donde": "Balanz" },
 *     { "nombre": "Fondo LECAP", "tipo": "fondo", "saldo": 819681, "tna": 30, "donde": "Balanz" }
 *   ]
 * En "patrimonio", si ya existe algo con ese nombre (o ese ticker) se actualiza; si no, se crea.
 *
 * Compras con tarjeta (del resumen), con la fecha en que compraste y el resumen en que se pagan:
 *   "compras_tarjeta": [
 *     { "tarjeta": "Visa Galicia", "fecha": "2026-10-03", "monto": 195559.06, "nota": "Publicidad Facebook",
 *       "categoria": "Costo de ventas", "resumen": "2026-11", "cuotas": 1, "detalle": "USD 82,89 + impuestos" }
 *   ]
 * Sin "resumen": se calcula con el día de cierre de la tarjeta (o el mes siguiente a la compra, si no lo tiene).
 * Si ya hay una compra en esa tarjeta con la misma fecha y un monto parecido, se marca como repetida.
 *
 * Fijos y suscripciones (se busca por nombre y tarjeta; si no existe, se crea):
 *   "fijos": [{ "nombre": "Claude", "monto": 40092, "tarjeta": "Visa Galicia", "categoria": "Suscripciones" }]
 * Con "antes" se busca el fijo por ese nombre y se le pone el nuevo: { "antes": "Claude", "nombre": "Claude (trabajo IT)", ... }
 * "dia" puede ser un número o "ultimo_habil" (el último día hábil del mes, ej: el sueldo).
 *
 * Cambios sobre compras con tarjeta ya cargadas (resumen en que empiezan a pagarse y/o categoría):
 *   "cambios_compras": [{ "buscar": { "tarjeta": "Visa Galicia", "nota": "Zapatillas" }, "resumen": "2026-12", "categoria": "Ropa" }]
 * "buscar" tiene que encontrar exactamente un movimiento (fecha exacta, monto con
 * signo y, si se pasan, un texto que contenga la nota y/o el nombre de su categoría).
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

export interface ImportChange {
  buscar: { fecha: string; monto: number; nota?: string; categoria?: string };
  borrar?: boolean;
  categoria?: string;
  nota?: string;
  fecha?: string;
  monto?: number;
  motivo?: string;
}

export interface ImportMerge {
  de: string;
  a: string;
}

export interface ImportCard {
  nombre: string;
  dia_de_pago: number;
}

export interface ImportAsset {
  nombre: string;
  tipo: AssetKind;
  saldo?: number;
  moneda?: "ARS" | "USD";
  ticker?: string;
  nominales?: number;
  precio?: number;
  tna?: number;
  donde?: string;
}

export interface ImportPurchase {
  tarjeta: string;
  fecha: string;
  monto: number;
  nota: string;
  categoria?: string;
  cuotas: number;
  /** YYYY-MM del resumen en que se paga la cuota 1 (si falta: el mes siguiente a la compra) */
  resumen: string;
  /** Texto libre para mostrar en la revisión (ej: "USD 20 + impuestos") */
  detalle?: string;
}

export interface ImportFijo {
  nombre: string;
  /** Nombre actual del fijo, si se lo quiere renombrar */
  antes?: string;
  monto: number;
  tipo: Kind;
  tarjeta?: string;
  categoria?: string;
  dia?: number;
  /** Se cobra el último día hábil del mes */
  ultimo_habil?: boolean;
}

export interface ImportPurchaseChange {
  buscar: { tarjeta?: string; nota: string; monto?: number; fecha?: string };
  /** YYYY-MM del resumen en que se paga la próxima cuota (en 1 pago: la única) */
  resumen?: string;
  categoria?: string;
}

export interface ImportFile {
  categorias: ImportCategory[];
  movimientos: ImportRow[];
  cambios: ImportChange[];
  fusionar: ImportMerge[];
  tarjetas: ImportCard[];
  patrimonio: ImportAsset[];
  compras: ImportPurchase[];
  fijos: ImportFijo[];
  cambiosCompras: ImportPurchaseChange[];
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
  /** La categoría no venía en el archivo: se sugirió por la nota */
  suggested?: boolean;
  action: Action;
  /** Movimiento ya cargado que coincide (repetido o el fijo del mes) */
  match: Transaction | null;
  fijoName: string | null;
  include: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

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
  const raw = Array.isArray(obj.movimientos) ? obj.movimientos : [];
  const rawChanges = Array.isArray(obj.cambios) ? obj.cambios : [];
  const rawMerges = Array.isArray(obj.fusionar_categorias) ? obj.fusionar_categorias : [];
  const rawCards = Array.isArray(obj.tarjetas) ? obj.tarjetas : [];
  const rawAssets = Array.isArray(obj.patrimonio) ? obj.patrimonio : [];
  const rawPurchases = Array.isArray(obj.compras_tarjeta) ? obj.compras_tarjeta : [];
  const rawFijos = Array.isArray(obj.fijos) ? obj.fijos : [];
  const rawPurchaseChanges = Array.isArray(obj.cambios_compras) ? obj.cambios_compras : [];
  if (
    !raw.length &&
    !rawChanges.length &&
    !rawMerges.length &&
    !rawCards.length &&
    !rawAssets.length &&
    !rawPurchases.length &&
    !rawFijos.length &&
    !rawPurchaseChanges.length
  ) {
    throw new Error("No encontré “movimientos” ni “cambios” para aplicar");
  }
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
  const cambios: ImportChange[] = rawChanges.map((r, i) => {
    const x = r as Partial<ImportChange>;
    const monto = Number(x.buscar?.monto);
    if (!isDate(x.buscar?.fecha) || !Number.isFinite(monto) || monto === 0) {
      throw new Error(`Cambio ${i + 1}: “buscar” necesita fecha (AAAA-MM-DD) y monto`);
    }
    const nuevoMonto = x.monto === undefined ? undefined : Number(x.monto);
    return {
      buscar: {
        fecha: x.buscar!.fecha,
        monto,
        nota: typeof x.buscar?.nota === "string" ? x.buscar.nota : undefined,
        categoria: typeof x.buscar?.categoria === "string" ? x.buscar.categoria : undefined,
      },
      borrar: x.borrar === true,
      categoria: typeof x.categoria === "string" ? x.categoria.trim() : undefined,
      nota: typeof x.nota === "string" ? x.nota.trim() : undefined,
      fecha: isDate(x.fecha) ? x.fecha : undefined,
      monto: nuevoMonto !== undefined && Number.isFinite(nuevoMonto) && nuevoMonto > 0 ? nuevoMonto : undefined,
      motivo: typeof x.motivo === "string" ? x.motivo : undefined,
    };
  });
  const fusionar = rawMerges
    .map((m) => m as Partial<ImportMerge>)
    .filter((m): m is ImportMerge => typeof m.de === "string" && typeof m.a === "string" && !!m.de.trim() && !!m.a.trim());
  const tarjetas = rawCards
    .map((c) => c as Partial<ImportCard>)
    .filter(
      (c): c is ImportCard =>
        typeof c.nombre === "string" && Number.isInteger(c.dia_de_pago) && c.dia_de_pago! >= 1 && c.dia_de_pago! <= 31,
    );
  const optNum = (v: unknown) => (v === undefined || v === null || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const patrimonio: ImportAsset[] = rawAssets.map((r, i) => {
    const x = r as Partial<Record<keyof ImportAsset, unknown>>;
    const tipo = x.tipo as AssetKind;
    if (typeof x.nombre !== "string" || !x.nombre.trim() || !["cuenta", "cedear", "fondo", "otro"].includes(tipo)) {
      throw new Error(`Patrimonio ${i + 1}: falta el nombre o el tipo (cuenta, cedear, fondo u otro)`);
    }
    if (tipo === "cedear" && (typeof x.ticker !== "string" || !optNum(x.nominales))) {
      throw new Error(`Patrimonio ${i + 1}: un CEDEAR necesita ticker y nominales`);
    }
    return {
      nombre: x.nombre.trim(),
      tipo,
      saldo: optNum(x.saldo),
      moneda: x.moneda === "USD" ? "USD" : "ARS",
      ticker: typeof x.ticker === "string" ? x.ticker.trim().toUpperCase() : undefined,
      nominales: optNum(x.nominales),
      precio: optNum(x.precio),
      tna: optNum(x.tna),
      donde: typeof x.donde === "string" ? x.donde.trim() : undefined,
    };
  });
  const compras: ImportPurchase[] = rawPurchases.map((r, i) => {
    const x = r as Partial<Record<keyof ImportPurchase, unknown>>;
    const monto = Math.abs(Number(x.monto));
    if (typeof x.tarjeta !== "string" || !isDate(x.fecha) || !Number.isFinite(monto) || monto === 0) {
      throw new Error(`Compra con tarjeta ${i + 1}: falta la tarjeta, la fecha (AAAA-MM-DD) o el monto`);
    }
    const cuotas = Number.isInteger(Number(x.cuotas)) && Number(x.cuotas) >= 1 ? Number(x.cuotas) : 1;
    // Sin resumen: se calcula con la tarjeta al planificar (día de cierre si lo tiene)
    const resumen = typeof x.resumen === "string" && /^\d{4}-\d{2}$/.test(x.resumen) ? x.resumen : "";
    return {
      tarjeta: x.tarjeta.trim(),
      fecha: x.fecha,
      monto: Math.round(monto * 100) / 100,
      nota: typeof x.nota === "string" && x.nota.trim() ? x.nota.trim() : "Compra",
      categoria: typeof x.categoria === "string" ? x.categoria.trim() : undefined,
      cuotas,
      resumen,
      detalle: typeof x.detalle === "string" ? x.detalle.trim() : undefined,
    };
  });
  const fijos: ImportFijo[] = rawFijos.map((r, i) => {
    const x = r as Partial<Record<keyof ImportFijo, unknown>>;
    const monto = Math.abs(Number(x.monto));
    if (typeof x.nombre !== "string" || !x.nombre.trim() || !Number.isFinite(monto) || monto === 0) {
      throw new Error(`Fijo ${i + 1}: falta el nombre o el monto`);
    }
    const dia = Number(x.dia);
    const ultimo = x.dia === "ultimo_habil";
    return {
      nombre: x.nombre.trim(),
      antes: typeof x.antes === "string" && x.antes.trim() ? x.antes.trim() : undefined,
      monto: Math.round(monto * 100) / 100,
      tipo: x.tipo === "income" ? "income" : "expense",
      tarjeta: typeof x.tarjeta === "string" && x.tarjeta.trim() ? x.tarjeta.trim() : undefined,
      categoria: typeof x.categoria === "string" ? x.categoria.trim() : undefined,
      dia: ultimo ? 31 : Number.isInteger(dia) && dia >= 1 && dia <= 31 ? dia : undefined,
      ultimo_habil: ultimo || undefined,
    };
  });
  const cambiosCompras: ImportPurchaseChange[] = rawPurchaseChanges.map((r, i) => {
    const x = r as Partial<ImportPurchaseChange>;
    if (!x.buscar || typeof x.buscar.nota !== "string" || !x.buscar.nota.trim()) {
      throw new Error(`Cambio de compra ${i + 1}: “buscar” necesita al menos la nota de la compra`);
    }
    const resumen = typeof x.resumen === "string" && /^\d{4}-\d{2}$/.test(x.resumen) ? x.resumen : undefined;
    const categoria = typeof x.categoria === "string" && x.categoria.trim() ? x.categoria.trim() : undefined;
    if (!resumen && !categoria) throw new Error(`Cambio de compra ${i + 1}: falta qué cambiar (resumen o categoría)`);
    const monto = Number(x.buscar.monto);
    return {
      buscar: {
        nota: x.buscar.nota.trim(),
        tarjeta: typeof x.buscar.tarjeta === "string" ? x.buscar.tarjeta.trim() : undefined,
        monto: Number.isFinite(monto) && monto !== 0 ? Math.abs(monto) : undefined,
        fecha: isDate(x.buscar.fecha) ? x.buscar.fecha : undefined,
      },
      resumen,
      categoria,
    };
  });
  return { categorias, movimientos, cambios, fusionar, tarjetas, patrimonio, compras, fijos, cambiosCompras };
}

const daysBetween = (a: string, b: string) => Math.abs(parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000;
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol);

/** Rango de fechas a consultar para buscar repetidos y lo que hay que corregir */
export function importRange(file: ImportFile) {
  const dates = [...file.movimientos.map((m) => m.fecha), ...file.cambios.map((c) => c.buscar.fecha)].sort();
  if (!dates.length) return null;
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
  /** Sugiere una categoría por la nota cuando el archivo no la trae */
  suggest?: (note: string, kind: Kind) => string | null,
): PlannedRow[] {
  const used = new Set<string>();
  const catByName = new Map(categories.map((c) => [`${c.kind}:${norm(c.name)}`, c]));

  // Primero los que confirman un fijo, así no se los "roba" un repetido
  const order = file.movimientos.map((row, key) => ({ row, key })).sort((a, b) => Number(!a.row.fijo) - Number(!b.row.fijo));

  const planned = order.map(({ row, key }): PlannedRow => {
    const kind: Kind = row.monto < 0 ? "expense" : "income";
    const amount = Math.abs(row.monto);
    const catName = row.categoria?.trim() || null;
    const suggestedId = !catName && row.nota && suggest ? suggest(row.nota, kind) : null;
    const category = catName ? (catByName.get(`${kind}:${norm(catName)}`) ?? null) : (categories.find((c) => c.id === suggestedId) ?? null);
    const period = row.fecha.slice(0, 7);
    const base = {
      key,
      row,
      kind,
      amount,
      category,
      newCategory: catName && !category ? catName : null,
      suggested: !catName && !!category,
    };

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
          return {
            ...base,
            category: fijoCat,
            newCategory: null,
            action: "fijo",
            match: tx,
            fijoName: r.name,
            include: true,
          };
        }
      }
    }

    // ¿Ya está cargado? (a mano o por un fijo)
    const dup = existing
      .filter(
        (t) => !used.has(t.id) && t.kind === kind && close(Number(t.amount), amount, 0.005) && daysBetween(t.occurred_on, row.fecha) <= 3,
      )
      .sort((a, b) => daysBetween(a.occurred_on, row.fecha) - daysBetween(b.occurred_on, row.fecha))[0];
    if (dup) {
      used.add(dup.id);
      return {
        ...base,
        action: "repetido",
        match: dup,
        fijoName: null,
        include: false,
      };
    }
    return {
      ...base,
      action: "nuevo",
      match: null,
      fijoName: null,
      include: true,
    };
  });

  return planned.sort((a, b) => b.row.fecha.localeCompare(a.row.fecha) || a.key - b.key);
}

export interface PlannedChange {
  key: number;
  change: ImportChange;
  /** Movimiento encontrado (null si no está o hay más de uno igual) */
  target: Transaction | null;
  problem: string | null;
  patch: Partial<Pick<Transaction, "category_id" | "note" | "occurred_on" | "amount">>;
  category: Category | null;
  newCategory: string | null;
  include: boolean;
}

export interface PlannedMerge {
  key: number;
  from: Category | null;
  to: Category | null;
  merge: ImportMerge;
  include: boolean;
}

/** Busca cada movimiento a corregir; si no aparece (o es ambiguo) queda sin aplicar */
export function planChanges(file: ImportFile, existing: Transaction[], categories: Category[]): PlannedChange[] {
  const used = new Set<string>();
  return file.cambios.map((change, key): PlannedChange => {
    const { fecha, monto, nota, categoria } = change.buscar;
    const catOf = (t: Transaction) => categories.find((c) => c.id === t.category_id)?.name ?? "";
    const kind: Kind = monto < 0 ? "expense" : "income";
    const hits = existing.filter(
      (t) =>
        !used.has(t.id) &&
        t.kind === kind &&
        t.occurred_on === fecha &&
        close(Number(t.amount), Math.abs(monto), 0.005) &&
        (!nota || norm(t.note ?? "").includes(norm(nota))) &&
        (!categoria || norm(catOf(t)) === norm(categoria)),
    );
    const base = { key, change, patch: {}, category: null, newCategory: null };
    if (hits.length !== 1) {
      return {
        ...base,
        target: null,
        include: false,
        problem: hits.length ? "Hay más de uno igual: no sé cuál" : "No lo encontré (¿ya lo cambiaste?)",
      };
    }
    const target = hits[0];
    used.add(target.id);
    const patch: PlannedChange["patch"] = {};
    let category: Category | null = null;
    let newCategory: string | null = null;
    if (change.categoria) {
      category = categories.find((c) => c.kind === kind && norm(c.name) === norm(change.categoria!)) ?? null;
      if (category) patch.category_id = category.id;
      else newCategory = change.categoria;
    }
    if (change.nota !== undefined) patch.note = change.nota || null;
    if (change.fecha) patch.occurred_on = change.fecha;
    if (change.monto !== undefined) patch.amount = change.monto;
    // Si ya está como pide el archivo (por ejemplo, un archivo aplicado dos veces), no hay nada que hacer
    const same =
      !change.borrar &&
      !newCategory &&
      (Object.keys(patch) as (keyof typeof patch)[]).every((k) =>
        k === "amount" ? close(Number(target.amount), Number(patch.amount), 0) : (target[k] ?? null) === (patch[k] ?? null),
      );
    if (same) return { ...base, target, problem: "Ya está así", patch: {}, category, newCategory, include: false };
    return {
      ...base,
      target,
      problem: null,
      patch,
      category,
      newCategory,
      include: true,
    };
  });
}

export function planMerges(file: ImportFile, categories: Category[]): PlannedMerge[] {
  return file.fusionar.map((merge, key) => {
    const from = categories.find((c) => norm(c.name) === norm(merge.de)) ?? null;
    const to = categories.find((c) => norm(c.name) === norm(merge.a) && (!from || c.kind === from.kind)) ?? null;
    return {
      key,
      merge,
      from,
      to,
      include: !!from && !!to && from.id !== to.id,
    };
  });
}

export interface PlannedCard {
  key: number;
  card: Card | null;
  change: ImportCard;
  include: boolean;
}

export function planCards(file: ImportFile, cards: Card[]): PlannedCard[] {
  return file.tarjetas.map((change, key) => {
    const card = cards.find((c) => norm(c.name) === norm(change.nombre)) ?? null;
    return { key, card, change, include: !!card && card.due_day !== change.dia_de_pago };
  });
}

/** Categoría existente por nombre, o el nombre de la que hay que crear */
function resolveCategory(name: string | undefined, kind: Kind, categories: Category[]) {
  if (!name) return { category: null, newCategory: null };
  const category = categories.find((c) => c.kind === kind && norm(c.name) === norm(name)) ?? null;
  return { category, newCategory: category ? null : name };
}

export interface PlannedPurchase {
  key: number;
  item: ImportPurchase;
  card: Card | null;
  category: Category | null;
  newCategory: string | null;
  /** Compra ya cargada que coincide */
  match: Purchase | null;
  include: boolean;
}

export function planPurchases(file: ImportFile, cards: Card[], purchases: Purchase[], categories: Category[]): PlannedPurchase[] {
  return file.compras.map((item, key) => {
    const card = cards.find((c) => norm(c.name) === norm(item.tarjeta)) ?? null;
    if (!item.resumen) item = { ...item, resumen: card?.closing_day ? periodForPurchase(card, item.fecha) : addMonths(item.fecha.slice(0, 7), 1) };
    const match =
      (card &&
        purchases.find(
          (p) =>
            p.card_id === card.id &&
            p.purchased_on === item.fecha &&
            (close(Number(p.total_amount), item.monto, 0.05) || norm(p.description) === norm(item.nota)),
        )) ??
      null;
    return { key, item, card, ...resolveCategory(item.categoria, "expense", categories), match, include: !!card && !match };
  });
}

export interface PlannedFijo {
  key: number;
  item: ImportFijo;
  card: Card | null;
  /** El fijo que se actualiza (null: se crea) */
  existing: Recurring | null;
  category: Category | null;
  newCategory: string | null;
  /** Ya está así: no hay nada que cambiar */
  same: boolean;
  problem: string | null;
  include: boolean;
}

export function planFijos(file: ImportFile, recurring: Recurring[], cards: Card[], categories: Category[]): PlannedFijo[] {
  return file.fijos.map((item, key) => {
    const card = item.tarjeta ? (cards.find((c) => norm(c.name) === norm(item.tarjeta!)) ?? null) : null;
    const problem = item.tarjeta && !card ? `No encontré la tarjeta “${item.tarjeta}”` : null;
    // Mismo nombre y, si se indica, misma tarjeta: así puede haber un "Claude" en cada tarjeta
    const find = (name: string) =>
      recurring.find((r) => r.kind === item.tipo && norm(r.name) === norm(name) && (!item.tarjeta || r.card_id === card?.id)) ?? null;
    // Si ya se renombró (importaste dos veces), lo encuentra por el nombre nuevo
    const existing = (item.antes ? find(item.antes) : null) ?? find(item.nombre);
    const cat = resolveCategory(item.categoria, item.tipo, categories);
    const same =
      !!existing &&
      existing.name === item.nombre &&
      Math.abs(Number(existing.amount) - item.monto) < 0.005 &&
      (!item.categoria || existing.category_id === cat.category?.id) &&
      (item.ultimo_habil ? !!existing.last_business_day : !item.dia || (existing.day === item.dia && !existing.last_business_day));
    return { key, item, card, existing, ...cat, same, problem, include: !problem && !same };
  });
}

export interface PlannedPurchaseChange {
  key: number;
  change: ImportPurchaseChange;
  /** La compra encontrada (null si no hay exactamente una) */
  target: Purchase | null;
  card: Card | null;
  category: Category | null;
  newCategory: string | null;
  /** Resumen en que hoy se paga la próxima cuota */
  fromPeriod: string | null;
  same: boolean;
  problem: string | null;
  include: boolean;
}

/** Período en que se paga la primera cuota que falta de una compra */
export const nextPurchasePeriod = (p: Pick<Purchase, "first_period" | "from_installment">) => addMonths(p.first_period, Math.max(1, p.from_installment) - 1);

export function planPurchaseChanges(file: ImportFile, purchases: Purchase[], cards: Card[], categories: Category[]): PlannedPurchaseChange[] {
  return file.cambiosCompras.map((change, key) => {
    const b = change.buscar;
    const card = b.tarjeta ? (cards.find((c) => norm(c.name) === norm(b.tarjeta!)) ?? null) : null;
    const found = purchases.filter(
      (p) =>
        norm(p.description).includes(norm(b.nota)) &&
        (!b.tarjeta || p.card_id === card?.id) &&
        (b.monto === undefined || close(Number(p.total_amount), b.monto, 0.01)) &&
        (!b.fecha || p.purchased_on === b.fecha),
    );
    const target = found.length === 1 ? found[0] : null;
    const problem =
      b.tarjeta && !card
        ? `No encontré la tarjeta “${b.tarjeta}”`
        : !found.length
          ? `No encontré la compra “${b.nota}”`
          : found.length > 1
            ? `Hay ${found.length} compras que coinciden con “${b.nota}”: agregá monto o fecha`
            : null;
    const cat = resolveCategory(change.categoria, "expense", categories);
    const fromPeriod = target ? nextPurchasePeriod(target) : null;
    const same =
      !!target && (!change.resumen || change.resumen === fromPeriod) && (!change.categoria || target.category_id === cat.category?.id);
    return { key, change, target, card, ...cat, fromPeriod, same, problem, include: !problem && !same };
  });
}

export interface PlannedAsset {
  key: number;
  item: ImportAsset;
  /** Lo que ya tenés con ese nombre/ticker (se actualiza) o null (se crea) */
  existing: Asset | null;
  include: boolean;
}

export function planAssets(file: ImportFile, assets: Asset[]): PlannedAsset[] {
  const used = new Set<string>();
  return file.patrimonio.map((item, key) => {
    const existing =
      assets.find(
        (a) =>
          !used.has(a.id) &&
          a.kind === item.tipo &&
          (item.tipo === "cedear" && item.ticker ? a.ticker?.toUpperCase() === item.ticker : norm(a.name) === norm(item.nombre)),
      ) ?? null;
    if (existing) used.add(existing.id);
    return { key, item, existing, include: true };
  });
}

/** Fila para guardar en la tabla assets */
export function assetRow(item: ImportAsset) {
  const now = new Date().toISOString();
  const isCedear = item.tipo === "cedear";
  return {
    name: item.nombre,
    kind: item.tipo,
    ticker: isCedear ? (item.ticker ?? null) : null,
    quantity: isCedear ? (item.nominales ?? 0) : null,
    balance: isCedear ? null : (item.saldo ?? 0),
    currency: isCedear ? "ARS" : (item.moneda ?? "ARS"),
    last_price: isCedear ? (item.precio ?? null) : null,
    price_at: isCedear && item.precio != null ? now : null,
    rate: item.tipo === "fondo" ? (item.tna ?? null) : null,
    broker: item.donde || null,
    updated_at: now,
  };
}
