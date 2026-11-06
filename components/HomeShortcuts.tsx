"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { compact } from "@/lib/format";
import { loadPatrimonio } from "@/lib/patrimonio";
import { BankIcon, ChevronRight } from "./Icons";

/** Acceso de Inicio a tu patrimonio (con el último valor conocido) */
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
    <Link href="/patrimonio" className="glass press rise flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ animationDelay: `${delay}ms` }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-inset text-muted"><BankIcon width={20} height={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Patrimonio</span>
        <span className="block truncate text-xs text-muted">{net == null ? "Cargá tus cuentas e inversiones" : "Cuentas + inversiones"}</span>
      </span>
      {net != null && <span className="num shrink-0 font-semibold">{compact(net)}</span>}
      <ChevronRight width={18} height={18} className="shrink-0 text-muted" />
    </Link>
  );
}
