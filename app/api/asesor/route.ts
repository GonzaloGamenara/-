import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// El asesor: Claude con todos tus datos de la app como contexto y búsqueda web para lo que cambia
// (tasas, precios, noticias). Solo lo pueden usar los emails de ASESOR_EMAILS: cada consulta se
// cobra a tu clave de la API de Anthropic.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 60;
const MAX_CONTEXT_CHARS = 600_000;

const SYSTEM = `Sos el asesor financiero personal del dueño de esta app de gastos. Vive en Argentina y maneja pesos (ARS); también puede tener dólares e inversiones (CEDEARs, fondos, LECAPs, plazos fijos, etc.).

Tenés, más abajo, una exportación completa de sus datos: ingresos, gastos por mes y categoría, fijos, tarjetas y cuotas, deudas con otras personas, cada movimiento y su patrimonio (cuentas e inversiones valuadas). Usalos como fuente principal y citá los números concretos cuando respondas. Si un dato no está, decilo y preguntá; no lo inventes.

Para lo que cambia día a día (tasas de plazo fijo y cauciones, rendimiento de fondos money market y LECAPs, cotizaciones, dólar, inflación, noticias del mercado) usá la búsqueda web antes de afirmar un número, y decí de dónde sale y de qué fecha es.

Cómo responder:
- Español rioplatense, directo y concreto. Primero la respuesta, después el porqué.
- Pensado para leer en el celular: párrafos cortos, viñetas, montos en negrita. Evitá tablas de más de 3 columnas.
- Cuando recomiendes algo, mostrá la cuenta (cuánto, dónde, qué rendiría, qué riesgo tiene) y alternativas según su horizonte y su tolerancia al riesgo. Si no los conocés y son importantes para la respuesta, preguntá.
- Tené en cuenta lo que ya está comprometido (tarjetas por pagar, cuotas, fijos que vienen) antes de sugerir invertir plata.
- Sé honesto con la incertidumbre y los riesgos, sin llenar la respuesta de advertencias genéricas.`;

type Msg = { role: "user" | "assistant"; content: string };

const fail = (status: number, error: string) => Response.json({ error }, { status });

function parseBody(body: unknown): { messages: Msg[]; context: string } | string {
  if (!body || typeof body !== "object") return "Pedido inválido";
  const { messages, context } = body as { messages?: unknown; context?: unknown };
  if (typeof context !== "string" || !context.trim()) return "Faltan tus datos (contexto)";
  if (context.length > MAX_CONTEXT_CHARS) return "Tus datos son demasiado grandes para mandarlos de una vez";
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return "Conversación inválida";
  const clean: Msg[] = [];
  for (const m of messages) {
    const { role, content } = (m ?? {}) as Partial<Msg>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim() || content.length > 20_000) {
      return "Conversación inválida";
    }
    clean.push({ role, content });
  }
  if (clean[0].role !== "user" || clean[clean.length - 1].role !== "user") return "Conversación inválida";
  return { messages: clean, context };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "Falta configurar ANTHROPIC_API_KEY en Vercel.");
  const allowed = (process.env.ASESOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return fail(503, "Falta configurar ASESOR_EMAILS en Vercel (tu email).");

  // Solo usuarios con sesión de la app y en la lista
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return fail(401, "Iniciá sesión de nuevo.");
  const { data: auth } = await createClient(url, key, { auth: { persistSession: false } }).auth.getUser(token);
  const email = auth.user?.email?.toLowerCase();
  if (!email) return fail(401, "Tu sesión venció: volvé a entrar.");
  if (!allowed.includes(email)) return fail(403, "Tu cuenta no tiene habilitado el asesor.");

  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = "Pedido inválido";
  }
  if (typeof parsed === "string") return fail(400, parsed);
  const { messages, context } = parsed;

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const history: Anthropic.Beta.BetaMessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
      try {
        // Las búsquedas web corren en el servidor de Anthropic; si se pausa (pause_turn) se retoma
        for (let round = 0; round < 4; round++) {
          const run = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 64000,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              thinking: { type: "adaptive" },
              output_config: { effort: "high" },
              system: [
                { type: "text", text: SYSTEM },
                { type: "text", text: `# Mis datos (exportados de la app)\n\n${context}`, cache_control: { type: "ephemeral" } },
              ],
              tools: [
                {
                  type: "web_search_20260209",
                  name: "web_search",
                  max_uses: 5,
                  user_location: { type: "approximate", country: "AR", city: "Buenos Aires", timezone: "America/Argentina/Buenos_Aires" },
                },
              ],
              cache_control: { type: "ephemeral" },
              messages: history,
            },
            { signal: req.signal },
          );

          const searchInput = new Map<number, string>();
          for await (const ev of run) {
            if (ev.type === "content_block_start") {
              const b = ev.content_block;
              if (b.type === "thinking") send({ t: "status", v: "Pensando…" });
              else if (b.type === "server_tool_use") {
                searchInput.set(ev.index, "");
                send({ t: "status", v: "Buscando en internet…" });
              } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
                const sources = b.content.map((r) => ({ title: r.title, url: r.url }));
                if (sources.length) send({ t: "sources", v: sources });
              }
            } else if (ev.type === "content_block_delta") {
              if (ev.delta.type === "text_delta") send({ t: "text", v: ev.delta.text });
              else if (ev.delta.type === "input_json_delta" && searchInput.has(ev.index)) {
                searchInput.set(ev.index, searchInput.get(ev.index)! + ev.delta.partial_json);
              }
            } else if (ev.type === "content_block_stop" && searchInput.has(ev.index)) {
              try {
                const q = (JSON.parse(searchInput.get(ev.index)!) as { query?: string }).query;
                if (q) send({ t: "status", v: `Buscando: ${q}` });
              } catch {
                /* input incompleto: no mostramos la búsqueda */
              }
            }
          }

          const final = await run.finalMessage();
          if (final.stop_reason === "pause_turn") {
            history.push({ role: "assistant", content: final.content });
            continue;
          }
          if (final.stop_reason === "refusal") send({ t: "error", v: "El asesor no pudo responder esa consulta. Probá reformularla." });
          if (final.stop_reason === "max_tokens") send({ t: "text", v: "\n\n_(La respuesta quedó cortada por largo.)_" });
          send({ t: "done", usage: final.usage });
          break;
        }
      } catch (e) {
        if (!req.signal.aborted) {
          const msg =
            e instanceof Anthropic.AuthenticationError
              ? "La clave de Anthropic no es válida (ANTHROPIC_API_KEY)."
              : e instanceof Anthropic.RateLimitError
                ? "Demasiadas consultas seguidas: esperá un minuto."
                : e instanceof Anthropic.APIError
                  ? `Error de la API (${e.status}): ${e.message}`
                  : "Se cortó la conexión con el asesor.";
          send({ t: "error", v: msg });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
