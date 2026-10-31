"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { useStore } from "./store";
import { addMonths, currentMonth, monthStart } from "./format";
import type { Category, Kind } from "./types";

/**
 * Categorías automáticas: aprende de tus notas ("Latino Sandwich" → Comida afuera) y sugiere
 * la categoría mientras escribís. Sin IA ni servicios externos: cuenta qué categoría usaste
 * con cada nota y con cada palabra.
 */

interface Entry {
  id: string;
  note: string;
  categoryId: string;
}

export interface Suggestion {
  categoryId: string;
  /** Qué la disparó: la misma nota, el principio de una nota, una palabra o una regla general */
  via: "nota" | "inicio" | "palabra" | "regla";
}

export interface Completion {
  note: string;
  categoryId: string;
}

const STOP = new Set(["de", "del", "la", "las", "el", "los", "con", "para", "por", "una", "uno", "un", "y", "en", "al", "a"]);

/** "Merpago*LATINOSANDWIC" → "latinosandwic" · "Café  con   leche" → "cafe con leche" */
export function normNote(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(merpago|mercadopago|payu\*ar|payu|dlocal|dlo|pvs|paymovil|mp)\*/, "")
    .replace(/[^a-z0-9ñ+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Sin espacios: "mc donalds" y "mcdonald s" (de "McDonald's") quedan iguales */
export const compact = (n: string) => n.replace(/ /g, "");
const tokens = (n: string) => n.split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

/** Servicios que casi siempre son suscripciones (también lo usa el radar) */
export const SUBS_RE = /\b(netflix|spotify|hbo|max|disney|youtube|prime|paramount|crunchyroll|claude|chatgpt|openai|icloud|apple|google one|meli|nivel 6|deezer|tidal|canva|notion|adobe|xbox game pass|game pass|playstation plus|ps plus|nintendo online|duolingo|patreon|twitch)\b/;

/** Reglas para cuando todavía no hay historial: palabra → nombres de categoría posibles */
const RULES: [RegExp, string[]][] = [
  [/\b(uber|didi|cabify|taxi|remis|sube|colectivo|subte|tren|nafta|ypf|shell|axion|peaje|estacionamiento)\b/, ["Transporte"]],
  [/\b(pedidosya|rappi|delivery)\b/, ["Delivery"]],
  [/\b(coto|carrefour|dia|jumbo|disco|vea|chango|chino|super|supermercado|verduleria|verdu|carniceria|almacen|autoservicio)\b/, ["Supermercado"]],
  [SUBS_RE, ["Suscripciones"]],
  [/\b(kiosco|kiosko|maxikiosco)\b/, ["Kiosco"]],
  [/\b(cafe|cafeteria|medialunas|helado|helados|heladeria|panaderia|reposteria)\b/, ["Café y antojos", "Comida afuera"]],
  [/\b(farmacia|medico|dentista|obra social|prepaga|osde|swiss)\b/, ["Salud"]],
  [/\b(luz|edenor|edesur|gas|metrogas|agua|aysa|internet|movistar|personal|claro|telecentro|fibertel|tuenti)\b/, ["Servicios"]],
  [/\b(alquiler|expensas)\b/, ["Vivienda", "Servicios"]],
  [/\b(cine|teatro|recital|bar|boliche)\b/, ["Salidas"]],
  [/\b(libro|libreria)\b/, ["Libros", "Estudio"]],
  [/\b(steam|playstation|xbox|nintendo|juego)\b/, ["Videojuegos"]],
  [/\b(regalo|flores|floreria)\b/, ["Regalos"]],
];

type Counts = Map<string, number>;
const bump = (m: Map<string, Counts>, key: string, cat: string) => {
  const c = m.get(key) ?? new Map<string, number>();
  c.set(cat, (c.get(cat) ?? 0) + 1);
  m.set(key, c);
};
const top = (c: Counts | undefined, allowed: Set<string>) => {
  if (!c) return null;
  let best: string | null = null;
  let bestN = 0;
  let total = 0;
  for (const [cat, n] of c) {
    if (!allowed.has(cat)) continue;
    total += n;
    if (n > bestN) [best, bestN] = [cat, n];
  }
  return best ? { cat: best, n: bestN, share: bestN / total } : null;
};

export function buildIndex(entries: Entry[]) {
  const byNote = new Map<string, Counts>();
  const byToken = new Map<string, Counts>();
  const display = new Map<string, { text: string; n: number }>();
  for (const e of entries) {
    const n = normNote(e.note);
    if (!n) continue;
    bump(byNote, n, e.categoryId);
    for (const t of new Set(tokens(n))) bump(byToken, t, e.categoryId);
    const d = display.get(n);
    display.set(n, { text: d?.text ?? e.note.trim(), n: (d?.n ?? 0) + 1 });
  }
  return { byNote, byToken, display };
}
export type CategoryIndex = ReturnType<typeof buildIndex>;

export function suggestCategory(index: CategoryIndex, text: string, kind: Kind, categories: Category[]): Suggestion | null {
  const n = normNote(text);
  if (n.length < 2) return null;
  const allowed = new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));

  // 1. La misma nota que ya usaste (también escrita con otros espacios)
  const exact = top(index.byNote.get(n), allowed);
  if (exact) return { categoryId: exact.cat, via: "nota" };
  const cn = compact(n);

  // 2. El principio de una nota conocida ("lati" → "latino sandwich", "latinosandwic" del banco → "latino sandwich")
  if (cn.length >= 3) {
    const agg: Counts = new Map();
    for (const [note, c] of index.byNote) if (compact(note).startsWith(cn)) for (const [cat, k] of c) agg.set(cat, (agg.get(cat) ?? 0) + k);
    const p = top(agg, allowed);
    if (p && p.share >= 0.6) return { categoryId: p.cat, via: "inicio" };
  }

  // 3. Palabras: cuentan las completas y, la última, también a medio escribir
  const ws = tokens(n);
  const last = n.split(" ").pop() ?? "";
  if (ws.length || last.length >= 3) {
    const agg: Counts = new Map();
    for (const w of ws) for (const [cat, k] of index.byToken.get(w) ?? []) agg.set(cat, (agg.get(cat) ?? 0) + k);
    if (last.length >= 3 && !ws.includes(last)) {
      for (const [tok, c] of index.byToken) if (tok.startsWith(last)) for (const [cat, k] of c) agg.set(cat, (agg.get(cat) ?? 0) + k * 0.5);
    }
    const p = top(agg, allowed);
    if (p && p.share >= 0.6) return { categoryId: p.cat, via: "palabra" };
  }

  // 4. Reglas generales (solo si tenés una categoría con ese nombre)
  for (const [re, names] of RULES) {
    if (!re.test(n)) continue;
    for (const name of names) {
      const c = categories.find((x) => x.kind === kind && normNote(x.name) === normNote(name));
      if (c) return { categoryId: c.id, via: "regla" };
    }
  }
  return null;
}

/** Notas que ya usaste y empiezan (o tienen una palabra que empieza) con lo que escribís */
export function completeNote(index: CategoryIndex, text: string, kind: Kind, categories: Category[], limit = 3): Completion[] {
  const n = normNote(text);
  if (n.length < 2) return [];
  const allowed = new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));
  const out: (Completion & { score: number })[] = [];
  for (const [note, c] of index.byNote) {
    if (note === n) continue;
    const starts = compact(note).startsWith(compact(n));
    if (!starts && !note.split(" ").some((w) => w.startsWith(n))) continue;
    const best = top(c, allowed);
    if (!best) continue;
    const d = index.display.get(note)!;
    out.push({ note: d.text, categoryId: best.cat, score: d.n + (starts ? 100 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Historial de un año (una sola vez por sesión) + lo que cargues mientras tanto */
let cache: { userId: string; entries: Entry[] } | null = null;

export function useCategoryIndex() {
  const { userId, txs, prevTxs, purchases } = useStore();
  const [base, setBase] = useState<Entry[]>(() => (cache?.userId === userId ? cache.entries : []));

  useEffect(() => {
    if (cache?.userId === userId) return;
    let alive = true;
    supabase()
      .from("transactions")
      .select("id,note,category_id")
      .not("note", "is", null)
      .not("category_id", "is", null)
      .gte("occurred_on", monthStart(addMonths(currentMonth(), -12)))
      .limit(5000)
      .then(({ data }) => {
        if (!alive || !data) return;
        const entries = (data as { id: string; note: string; category_id: string }[]).map((r) => ({ id: r.id, note: r.note, categoryId: r.category_id }));
        cache = { userId, entries };
        setBase(entries);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return useMemo(() => {
    const seen = new Map<string, Entry>();
    for (const e of base) seen.set(e.id, e);
    // Lo recién cargado o editado pisa lo que vino del historial
    for (const t of [...prevTxs, ...txs]) if (t.note && t.category_id && !t.purchase_id) seen.set(t.id, { id: t.id, note: t.note, categoryId: t.category_id });
    for (const p of purchases) if (p.description && p.category_id) seen.set(`p-${p.id}`, { id: `p-${p.id}`, note: p.description, categoryId: p.category_id });
    return buildIndex([...seen.values()]);
  }, [base, txs, prevTxs, purchases]);
}
