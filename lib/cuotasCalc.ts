/**
 * ¿Conviene en cuotas o de contado?
 * Trae cada cuota a "pesos de hoy" descontándola por la inflación mensual esperada y
 * compara contra el precio de contado. También calcula el interés implícito del plan.
 */
export interface CuotasInput {
  contado: number;
  cuotas: number;
  valorCuota: number;
  /** Inflación mensual esperada, ej 0.025 = 2,5% */
  inflacion: number;
  /** Meses hasta la primera cuota (1 = el mes que viene, lo típico con tarjeta) */
  demora?: number;
}

export function evaluarCuotas({ contado, cuotas, valorCuota, inflacion, demora = 1 }: CuotasInput) {
  const pv = (rate: number) => {
    let s = 0;
    for (let k = 0; k < cuotas; k++) s += valorCuota / Math.pow(1 + rate, demora + k);
    return s;
  };
  const total = valorCuota * cuotas;
  const valorHoy = pv(inflacion);
  const diferencia = contado - valorHoy; // > 0: las cuotas salen más baratas en pesos de hoy

  // Interés mensual implícito: la tasa que iguala las cuotas al precio de contado
  let tasa: number | null = null;
  if (contado > 0 && total > 0) {
    let lo = -0.5;
    let hi = 1;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (pv(mid) > contado) lo = mid;
      else hi = mid;
    }
    tasa = (lo + hi) / 2;
  }

  return {
    total,
    valorHoy,
    diferencia,
    conviene: Math.abs(diferencia) < contado * 0.005 ? ("igual" as const) : diferencia > 0 ? ("cuotas" as const) : ("contado" as const),
    recargo: contado > 0 ? total / contado - 1 : 0,
    tasaMensual: tasa,
    tasaAnual: tasa === null ? null : Math.pow(1 + tasa, 12) - 1,
  };
}

const KEY = "gastos.inflacion.oficial";

export interface InflacionOficial {
  valor: number; // % mensual
  fecha: string; // último mes publicado (YYYY-MM-DD)
}

/** Último dato oficial guardado en el dispositivo (para usarlo al toque o sin conexión). */
export function inflacionGuardada(): InflacionOficial | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && Number(v.valor) > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Trae el último dato del INDEC (vía el servidor de la app) y lo guarda. */
export async function traerInflacion(): Promise<InflacionOficial | null> {
  try {
    const res = await fetch("/api/inflacion");
    if (!res.ok) return null;
    const d = await res.json();
    if (!(Number(d.valor) > 0)) return null;
    const out = { valor: Number(d.valor), fecha: String(d.fecha) };
    localStorage.setItem(KEY, JSON.stringify(out));
    return out;
  } catch {
    return null;
  }
}
