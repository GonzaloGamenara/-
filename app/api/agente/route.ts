import { createClient } from "@supabase/supabase-js";
import { buildDataset, toMarkdown, type Range } from "@/lib/exporter";
import { readOnlyDb } from "@/lib/agentDb";
import { getPrecios } from "@/lib/precios";
import { addMonths, currentMonth, monthStart } from "@/lib/format";

/**
 * GET /api/agente — tus finanzas para tu agente de IA (solo lectura).
 *
 * Autenticación: token personal creado en la app (Perfil → Agente de IA), por header
 *   Authorization: Bearer <token>
 * o, para agentes que solo pueden abrir una URL, ?token=<token>.
 *
 * Parámetros: rango = mes | 3m (por defecto) | 12m | todo · formato = md (por defecto) | json
 * El contenido es el mismo del export de la app: resumen por mes, categorías, fijos, tarjetas,
 * techos, patrimonio y todos los movimientos del período.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Las fechas ("hoy", "este mes") en hora de Argentina, no en la del servidor
process.env.TZ = "America/Argentina/Buenos_Aires";

const RANGES: Record<string, Range> = { mes: "month", month: "month", "3m": "3m", "12m": "12m", todo: "all", all: "all" };
const HEADERS = { "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow" };

const fail = (status: number, error: string) => Response.json({ error, uso: "GET /api/agente?rango=3m&formato=md con Authorization: Bearer <token> (o ?token=<token>)" }, { status, headers: HEADERS });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("token")?.trim() || "";
  if (!token) return fail(401, "Falta el token. Crealo en la app: Perfil → Agente de IA.");

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!sbUrl || !sbKey) return fail(500, "Supabase no está configurado en el servidor");
  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const range = RANGES[url.searchParams.get("rango") ?? url.searchParams.get("range") ?? "3m"] ?? "3m";
  const json = (url.searchParams.get("formato") ?? url.searchParams.get("format")) === "json";

  const read = async (table: string, from: string | null = null) => {
    const { data, error } = await sb.rpc("agent_read", { p_token: token, p_table: table, p_from: from });
    if (error) throw error;
    return data;
  };

  // Primero el token: si no sirve, 401 (y no un export vacío)
  let perfil: { alias?: string | null } | null;
  try {
    perfil = (await read("perfil")) as { alias?: string | null } | null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "PGRST202" || /agent_read|could not find the function/i.test(err.message ?? "")) {
      return fail(503, "Falta correr supabase/migrations/010_agente.sql en Supabase");
    }
    return fail(401, "Token inválido o revocado");
  }

  // Movimientos: los del período y los saldos de cuentas necesitan, como mucho, un año para atrás
  const txFrom = range === "all" ? null : monthStart(addMonths(currentMonth(), -13));
  const db = readOnlyDb(async (table) => ((await read(table, table === "transactions" ? txFrom : null)) ?? []) as Record<string, unknown>[]);

  const precios = await getPrecios().catch(() => null);
  const prices = precios ? { quotes: precios.quotes, mep: precios.mep, at: precios.at } : null;

  try {
    const d = await buildDataset(range, perfil?.alias ?? "", { db, prices });
    return json
      ? Response.json(d, { headers: HEADERS })
      : new Response(toMarkdown(d), { headers: { ...HEADERS, "content-type": "text/markdown; charset=utf-8" } });
  } catch (e) {
    return fail(500, `No pude armar tus datos: ${(e as Error)?.message ?? e}`);
  }
}
