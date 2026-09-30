"use client";

import { useEffect, useState, type ReactNode } from "react";
import { launchTime } from "@/lib/launch";

const pad = (n: number) => String(n).padStart(2, "0");

/** Mantiene la app cerrada hasta la fecha de inicio y se abre sola al llegar. */
export function LaunchGate({ children }: { children: ReactNode }) {
  const [now, setNow] = useState<number | null>(null);
  const target = launchTime();

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  if (now === null) return <div className="min-h-dvh" />;
  if (now >= target) return <>{children}</>;

  const left = Math.max(0, target - now);
  const h = Math.floor(left / 3.6e6);
  const m = Math.floor((left % 3.6e6) / 6e4);
  const s = Math.floor((left % 6e4) / 1e3);
  const label = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(target));

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center justify-items-center gap-6 px-6 text-center">
      <div
        className="pop grid size-16 place-items-center rounded-[28%] text-3xl font-extrabold text-[#10130a]"
        style={{ background: "linear-gradient(135deg, #c4f542, #5eead4)" }}
      >
        $
      </div>
      <div className="rise">
        <h1 className="text-3xl font-semibold tracking-tight">Arranca mañana</h1>
        <p className="mt-2 text-muted">
          La cuenta empieza el <span className="text-fg">{label}</span>. Hasta entonces no se carga ni se cuenta nada.
        </p>
      </div>
      <div className="glass rise num flex items-center gap-2 rounded-3xl px-6 py-4 text-4xl font-semibold" style={{ animationDelay: "80ms" }} aria-label="Tiempo restante">
        <span>{pad(h)}</span>
        <span className="text-muted">:</span>
        <span>{pad(m)}</span>
        <span className="text-muted">:</span>
        <span>{pad(s)}</span>
      </div>
      <p className="text-xs text-muted">Se abre sola a las 00:00. Mientras tanto, podés dejarla instalada en el celu.</p>
    </main>
  );
}
