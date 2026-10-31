"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestaña "Plan": lo fijo de cada mes, las suscripciones y los techos, a un toque de distancia */
export function PlanTabs() {
  const path = usePathname();
  const tabs = [
    { href: "/fijos", label: "Fijos" },
    { href: "/suscripciones", label: "Suscripciones" },
    { href: "/techos", label: "Techos" },
  ];
  return (
    <nav className="rise grid grid-cols-3 rounded-full bg-inset p-1 text-sm font-semibold" aria-label="Plan">
      {tabs.map((t) => {
        const on = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`press rounded-full py-2 text-center ${on ? "bg-bg text-fg shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
