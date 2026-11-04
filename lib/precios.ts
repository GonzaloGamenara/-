import { parseMep, parsePanel, type Quote } from "./preciosFuente";

/** Cotizaciones de CEDEARs/acciones y dólar MEP desde fuentes públicas (solo servidor) */
const revalidate = 300;
const PANELES = ["https://data912.com/live/arg_cedears", "https://data912.com/live/arg_stocks"];
const MEP = ["https://dolarapi.com/v1/dolares/bolsa", "https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa"];

async function getJson(url: string) {
  const res = await fetch(url, { next: { revalidate }, headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getPrecios() {
  const errores: string[] = [];
  const quotes: Record<string, Quote> = {};
  const paneles = await Promise.allSettled(PANELES.map(getJson));
  paneles.forEach((p, i) => {
    // Si un símbolo está en los dos paneles, gana el de CEDEARs (va primero)
    if (p.status === "fulfilled") for (const [k, v] of Object.entries(parsePanel(p.value))) quotes[k] ??= v;
    else errores.push(`${PANELES[i]}: ${String(p.reason?.message ?? p.reason)}`);
  });

  let mep: number | null = null;
  for (const url of MEP) {
    try {
      mep = parseMep(await getJson(url));
      if (mep) break;
    } catch (e) {
      errores.push(`${url}: ${String((e as Error)?.message ?? e)}`);
    }
  }

  return { quotes, mep, at: new Date().toISOString(), errores };
}
