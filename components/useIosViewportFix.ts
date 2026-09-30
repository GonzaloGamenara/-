"use client";

import { useEffect } from "react";

/**
 * En iOS, una PWA instalada a veces reporta un viewport más corto que la pantalla
 * (≈ el área de la barra de inicio) y lo fijado abajo queda flotando. Medimos la diferencia
 * y la exponemos como --ios-gap. Al abrir la app iOS da valores transitorios raros, así que
 * se vuelve a medir varias veces y ante cualquier cambio, y solo se aceptan valores razonables.
 */
export function useIosViewportFix() {
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (!standalone || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;

    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)";
    document.body.appendChild(probe);

    const apply = () => {
      const topInset = probe.offsetHeight;
      const h = window.innerHeight;
      const portrait = h > window.innerWidth;
      const diff = Math.round(screen.height - h);
      // Solo corregimos el caso conocido: falta entre 20 y 50px abajo (la barra de inicio)
      const gap = topInset > 0 && portrait && diff >= 20 && diff <= 50 ? diff : 0;
      document.documentElement.style.setProperty("--ios-gap", `${gap}px`);
    };

    apply();
    const timers = [120, 400, 1000, 2500].map((ms) => setTimeout(apply, ms));
    const events = ["resize", "orientationchange", "pageshow", "focus"] as const;
    events.forEach((e) => window.addEventListener(e, apply));
    document.addEventListener("visibilitychange", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      timers.forEach(clearTimeout);
      events.forEach((e) => window.removeEventListener(e, apply));
      document.removeEventListener("visibilitychange", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      probe.remove();
    };
  }, []);
}
