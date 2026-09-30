/** Modo privado: oculta todos los montos (para mostrar la app o grabar la pantalla). */
const KEY = "gastos.ocultarMontos";
let hidden = false;

export const MASK = "$ ••••••";
export const isHidden = () => hidden;

export function setHidden(v: boolean) {
  hidden = v;
  if (typeof document !== "undefined") document.documentElement.classList.toggle("montos-ocultos", v);
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* no es crítico */
  }
}

export function loadHidden() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
