"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { compact } from "@/lib/format";
import { loadPatrimonio } from "@/lib/patrimonio";

/** Accesos de Inicio: tu patrimonio (con el último valor conocido) y el asesor */
export function HomeShortcuts({ delay = 0 }: { delay?: number }) {
  const [net, setNet] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadPatrimonio()
      .then((r) => alive && setNet(r.missing || !r.assets.length ? null : r.net))
      .catch(() => alive && setNet(null));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="grid grid-cols-2 gap-3">
      <Link href="/patrimonio" className="glass press rise grid gap-1 rounded-3xl p-4" style={{ animationDelay: `${delay}ms` }}>
        <span className="text-xs text-muted">🏦 Patrimonio</span>
        <span className="num truncate text-lg font-semibold">{net === undefined ? "…" : net === null ? "Cargalo" : compact(net)}</span>
        <span className="text-[11px] text-muted">{net == null ? "cuentas e inversiones" : "cuentas + inversiones"}</span>
      </Link>
      <Link
        href="/asesor"
        className="press rise relative grid gap-1 overflow-hidden rounded-3xl p-4 text-accent-ink"
        style={{ animationDelay: `${delay + 40}ms`, background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
      >
        <span className="text-xs opacity-80">✨ Asesor</span>
        <span className="text-lg font-semibold leading-tight">Preguntale</span>
        <span className="text-[11px] opacity-80">conoce todos tus números</span>
      </Link>
    </section>
  );
}
