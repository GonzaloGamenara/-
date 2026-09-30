"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { HomeIcon, ListIcon, PlusIcon, RepeatIcon, UserIcon, CloudOffIcon } from "./Icons";
import { QuickAdd } from "./QuickAdd";
import { PurchaseSheet } from "./PurchaseSheet";
import { useIosViewportFix } from "./useIosViewportFix";
import { PrelaunchBanner, PrelaunchCard, usePrelaunch } from "./LaunchGate";

const NAV = [
  { href: "/", label: "Inicio", Icon: HomeIcon, also: [] as string[] },
  { href: "/movimientos", label: "Movimientos", Icon: ListIcon, also: [] as string[] },
  null, // FAB
  { href: "/fijos", label: "Fijos", Icon: RepeatIcon, also: ["/tarjetas"] },
  { href: "/ajustes", label: "Perfil", Icon: UserIcon, also: ["/dividir"] },
] as const;

const isActive = (path: string, item: { href: string; also: readonly string[] }) =>
  path === item.href || item.also.some((a) => path === a || path.startsWith(a + "/"));

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { openSheet, toastMsg, pendingCount, sheet, purchaseSheet } = useStore();
  const prelaunch = usePrelaunch();
  useIosViewportFix();
  // En modo preparación solo están habilitados Fijos y Perfil
  const blocked = prelaunch && (path === "/" || path === "/movimientos");
  const items = NAV.filter((i) => !prelaunch || (i !== null && i.href !== "/movimientos"));

  // Atajos del ícono de la app: /?add=expense | /?add=income
  useEffect(() => {
    const kind = new URLSearchParams(window.location.search).get("add");
    if (kind === "expense" || kind === "income") {
      if (!prelaunch) openSheet({ kind });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [openSheet, prelaunch]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {pendingCount > 0 && (
        <div className="fade-in mb-3 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-muted">
          <CloudOffIcon width={16} height={16} />
          {pendingCount} movimiento{pendingCount > 1 ? "s" : ""} esperando conexión
        </div>
      )}
      {prelaunch && !blocked && <PrelaunchBanner />}
      {blocked ? <PrelaunchCard /> : children}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-2xl"
        style={{ transform: "translateY(var(--ios-gap, 0px))", paddingBottom: "max(0.375rem, calc(env(safe-area-inset-bottom) - 0.75rem))" }}
      >
        <ul className="mx-auto flex h-[3.75rem] w-full max-w-md items-stretch justify-between px-2">
          {items.map((item) =>
            item === null ? (
              <li key="fab" className="grid w-20 shrink-0 place-items-center">
                <button
                  onClick={() => openSheet()}
                  aria-label="Anotar movimiento"
                  className="press -mt-6 grid size-[3.75rem] place-items-center rounded-full text-accent-ink shadow-[0_8px_24px_-6px_rgb(20_184_166/0.55)] ring-4 ring-bg"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
                >
                  <PlusIcon width={28} height={28} />
                </button>
              </li>
            ) : (
              <li key={item.href} className="flex flex-1">
                <Link
                  href={item.href}
                  aria-current={isActive(path, item) ? "page" : undefined}
                  className={`press flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-tight transition-colors ${
                    isActive(path, item) ? "text-fg" : "text-muted"
                  }`}
                >
                  <span
                    className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                      isActive(path, item) ? "bg-inset" : ""
                    }`}
                  >
                    <item.Icon width={21} height={21} strokeWidth={isActive(path, item) ? 2.3 : 1.8} />
                  </span>
                  {item.label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      {sheet.open && !prelaunch && <QuickAdd />}
      {purchaseSheet.open && <PurchaseSheet />}

      {toastMsg && (
        <div role="status" aria-live="polite" className="pop pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-6">
          <div className="glass rounded-full px-4 py-2.5 text-sm font-medium">{toastMsg}</div>
        </div>
      )}
    </div>
  );
}
