"use client";

import { exitDemo, isDemo } from "@/lib/supabase";
import { useEffect, useState } from "react";

/** Aviso fijo arriba en el modo demo: datos ficticios y salir */
export function DemoBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isDemo()), []);
  if (!on) return null;
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">D</span>
      <span className="min-w-0 flex-1 text-muted">
        <b className="font-semibold text-fg">Demo</b> con datos ficticios<span className="hidden sm:inline">. Podés tocar todo: se borra al cerrar la pestaña</span>
      </span>
      <button onClick={exitDemo} className="press shrink-0 rounded-full bg-inset px-3 py-1 text-xs font-semibold">
        Salir
      </button>
    </div>
  );
}
