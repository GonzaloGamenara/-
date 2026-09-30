"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { HomeIcon, ListIcon, PlusIcon, RepeatIcon, UserIcon, CloudOffIcon } from "./Icons";
import { QuickAdd } from "./QuickAdd";

const NAV = [
  { href: "/", label: "Inicio", Icon: HomeIcon },
  { href: "/movimientos", label: "Movimientos", Icon: ListIcon },
  null, // FAB
  { href: "/fijos", label: "Fijos", Icon: RepeatIcon },
  { href: "/ajustes", label: "Perfil", Icon: UserIcon },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { openSheet, toastMsg, pendingCount, sheet } = useStore();

  // Atajos del ícono de la app: /?add=expense | /?add=income
  useEffect(() => {
    const kind = new URLSearchParams(window.location.search).get("add");
    if (kind === "expense" || kind === "income") {
      openSheet({ kind });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [openSheet]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))]">
      {pendingCount > 0 && (
        <div className="fade-in mb-3 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-muted">
          <CloudOffIcon width={16} height={16} />
          {pendingCount} movimiento{pendingCount > 1 ? "s" : ""} esperando conexión
        </div>
      )}
      {children}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ul className="glass flex w-full max-w-md items-center justify-between rounded-full px-2 py-1.5">
          {NAV.map((item, i) =>
            item === null ? (
              <li key="fab" className="-mt-7 px-1">
                <button
                  onClick={() => openSheet()}
                  aria-label="Anotar movimiento"
                  className="press grid size-16 place-items-center rounded-full text-accent-ink shadow-[0_10px_30px_-6px_rgb(94_234_212/0.6)] ring-[3px] ring-white/15"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
                >
                  <PlusIcon width={30} height={30} />
                </button>
              </li>
            ) : (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={path === item.href ? "page" : undefined}
                  className={`press flex flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-medium transition-colors ${
                    path === item.href ? "text-fg" : "text-muted"
                  }`}
                >
                  <item.Icon width={22} height={22} strokeWidth={path === item.href ? 2.3 : 1.8} />
                  {item.label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      {sheet.open && <QuickAdd />}

      {toastMsg && (
        <div role="status" aria-live="polite" className="pop pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-6">
          <div className="glass rounded-full px-4 py-2.5 text-sm font-medium">{toastMsg}</div>
        </div>
      )}
    </div>
  );
}
