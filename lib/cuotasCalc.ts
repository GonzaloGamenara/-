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

const KEY = "gastos.inflacion";
/** Inflación mensual que usaste la última vez (queda guardada en el dispositivo). */
export function inflacionGuardada(def = 2.5) {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 && v < 50 ? v : def;
  } catch {
    return def;
  }
}
export function guardarInflacion(v: number) {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* no es crítico */
  }
}
