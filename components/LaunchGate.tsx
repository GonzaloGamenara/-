"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isPrelaunch, launchTime } from "@/lib/launch";

const LaunchCtx = createContext(false);
/** true mientras la cuenta todavía no empezó (modo preparación) */
export const usePrelaunch = () => useContext(LaunchCtx);

/** Sabe si ya arrancó y se destraba solo a las 00:00, sin recargar. */
export function LaunchProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setLocked(isPrelaunch());
    check();
    const ms = launchTime() - Date.now();
    // setTimeout admite hasta ~24 días; si falta más, alcanza con el chequeo al volver a la app
    const timer = ms > 0 && ms < 2 ** 31 - 1 ? setTimeout(check, ms + 50) : undefined;
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (locked === null) return <div className="min-h-dvh" />;
  return <LaunchCtx.Provider value={locked}>{children}</LaunchCtx.Provider>;
}

const pad = (n: number) => String(n).padStart(2, "0");

function Countdown() {
  const [left, setLeft] = useState(() => Math.max(0, launchTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, launchTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(left / 3.6e6);
  const m = Math.floor((left % 3.6e6) / 6e4);
  const s = Math.floor((left % 6e4) / 1e3);
  return (
    <div className="glass num flex items-center gap-2 rounded-3xl px-6 py-4 text-4xl font-semibold" aria-label="Tiempo restante">
      <span>{pad(h)}</span><span className="text-muted">:</span>
      <span>{pad(m)}</span><span className="text-muted">:</span>
      <span>{pad(s)}</span>
    </div>
  );
}

/** Reemplaza Inicio y Movimientos hasta que arranque la cuenta. */
export function PrelaunchCard() {
  const label = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(launchTime()));
  return (
    <section className="rise grid justify-items-center gap-6 px-2 pb-6 pt-14 text-center">
      <div
        className="pop grid size-16 place-items-center rounded-[28%] text-3xl font-extrabold text-[#10130a]"
        style={{ background: "linear-gradient(135deg, #c4f542, #5eead4)" }}
      >
        $
      </div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Arranca mañana</h1>
        <p className="mx-auto mt-2 max-w-xs text-muted">
          La cuenta empieza el <span className="text-fg">{label}</span>. Hasta entonces no se calcula nada.
        </p>
      </div>
      <Countdown />
      <div className="glass w-full max-w-sm rounded-3xl p-5 text-left">
        <h2 className="font-medium">Mientras tanto, dejá todo listo</h2>
        <p className="mt-1 text-sm text-muted">
          Cargá tus fijos (sueldo, beca, alquiler, suscripciones) y ajustá tus categorías. Se empiezan a registrar solos desde el primer día.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/fijos" className="press rounded-2xl bg-accent py-3 text-center text-sm font-semibold text-accent-ink">
            Cargar fijos
          </Link>
          <Link href="/ajustes" className="press rounded-2xl bg-inset py-3 text-center text-sm font-semibold">
            Categorías
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Aviso chico para las pantallas habilitadas durante la preparación. */
export function PrelaunchBanner() {
  return (
    <div className="fade-in mb-3 rounded-2xl border border-line bg-inset px-3.5 py-2.5 text-sm text-muted">
      <b className="text-fg">Modo preparación.</b> Nada se calcula ni se carga hasta el {new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(new Date(launchTime()))}.
    </div>
  );
}
