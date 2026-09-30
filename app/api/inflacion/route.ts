import { ultimoDato } from "@/lib/inflacionFuente";

// Último dato de inflación mensual (INDEC), vía la API pública de ArgentinaDatos.
// Se cachea 12 h en el servidor: el celu nunca depende directo de la API externa.
export const revalidate = 43200;

const FUENTE = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion";

export async function GET() {
  try {
    const res = await fetch(FUENTE, { next: { revalidate }, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dato = ultimoDato(await res.json());
    if (!dato) throw new Error("formato inesperado");
    return Response.json({ ...dato, fuente: "INDEC (vía ArgentinaDatos)" });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
