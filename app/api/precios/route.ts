import { getPrecios } from "@/lib/precios";

// Cotizaciones de CEDEARs/acciones argentinas y dólar MEP, desde fuentes públicas.
// Se cachean 5 minutos en el servidor; si una fuente falla, la app usa el último precio guardado.
export const revalidate = 300;

export async function GET() {
  return Response.json(await getPrecios());
}
