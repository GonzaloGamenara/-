"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestañas de la sección "Cuentas": lo que se paga todos los meses. */
export function CuentasTabs() {
  const path = usePathname();
  const tabs = [
    { href: "/fijos", label: "Fijos" },
    { href: "/tarjetas", label: "Tarjetas" },
  ];
  return (
    <nav className="rise grid grid-cols-2 rounded-full bg-inset p-1 text-sm font-semibold" aria-label="Cuentas">
      {tabs.map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`press rounded-full py-2 text-center transition-colors ${on ? "bg-bg text-fg shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
