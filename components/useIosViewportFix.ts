"use client";

import { useEffect } from "react";

/**
 * En algunas versiones de iOS, una PWA instalada reporta un viewport más corto que la
 * pantalla real (falta aprox. el área de la barra de inicio). Los elementos con
 * `position: fixed; bottom: 0` quedan entonces flotando por encima del borde.
 * Medimos esa diferencia y la exponemos como --ios-gap para bajar la barra.
 */
export function useIosViewportFix() {
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (!standalone) return;

    // Si hay inset superior, el viewport arranca en el borde de arriba: la diferencia está abajo.
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)";
    document.body.appendChild(probe);

    const apply = () => {
      const topInset = probe.offsetHeight;
      const portrait = window.innerHeight > window.innerWidth;
      const diff = Math.round(screen.height - window.innerHeight);
      const gap = topInset > 0 && portrait && diff > 0 && diff <= 80 ? diff : 0;
      document.documentElement.style.setProperty("--ios-gap", `${gap}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      probe.remove();
    };
  }, []);
}
