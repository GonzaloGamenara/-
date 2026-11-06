"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { HomeIcon, ListIcon, PlusIcon, PlanIcon, UserIcon, CloudOffIcon, SplitIcon } from "./Icons";
import { QuickAdd } from "./QuickAdd";
import { PurchaseSheet } from "./PurchaseSheet";
import { useIosViewportFix } from "./useIosViewportFix";
import { PrelaunchBanner, PrelaunchCard, usePrelaunch } from "./LaunchGate";

const NAV = [
  { href: "/", label: "Inicio", Icon: HomeIcon, also: ["/patrimonio", "/cierre"] as string[] },
  { href: "/movimientos", label: "Movimientos", Icon: ListIcon, also: [] as string[] },
  null, // FAB
  { href: "/fijos", label: "Plan", Icon: PlanIcon, also: ["/tarjetas", "/techos", "/suscripciones"] },
  { href: "/ajustes", label: "Perfil", Icon: UserIcon, also: ["/dividir", "/importar", "/ajustes"] },
] as const;

const isActive = (path: string, item: { href: string; also: readonly string[] }) =>
  path === item.href || item.also.some((a) => path === a || path.startsWith(a + "/"));

/** Escritorio: barra lateral con la navegación completa (en el celu, la barra de abajo) */
const SIDE: { href: string; label: string; icon: ReactNode; also?: string[]; sub?: { href: string; label: string; also?: string[] }[]; prelaunch?: boolean }[] = [
  { href: "/", label: "Inicio", icon: <HomeIcon width={18} height={18} /> },
  { href: "/movimientos", label: "Movimientos", icon: <ListIcon width={18} height={18} /> },
  {
    href: "/fijos",
    label: "Plan",
    icon: <PlanIcon width={18} height={18} />,
    prelaunch: true,
    sub: [
      { href: "/fijos", label: "Fijos y tarjetas", also: ["/tarjetas"] },
      { href: "/suscripciones", label: "Suscripciones" },
      { href: "/techos", label: "Techos" },
    ],
  },
  { href: "/patrimonio", label: "Patrimonio", icon: <span className="text-[15px] leading-none">🏦</span>, prelaunch: true },
  { href: "/cierre", label: "Cierre de mes", icon: <span className="text-[15px] leading-none">📊</span> },
  { href: "/dividir", label: "Dividir cuentas", icon: <SplitIcon width={18} height={18} />, prelaunch: true },
  { href: "/ajustes", label: "Perfil", icon: <UserIcon width={18} height={18} />, also: ["/importar"], prelaunch: true },
];
const sideActive = (path: string, href: string, also: string[] = []) =>
  href === "/" ? path === "/" : [href, ...also].some((a) => path === a || path.startsWith(a + "/"));

/** Páginas que en escritorio usan todo el ancho (dos columnas); el resto, ancho de lectura */
const WIDE = ["/", "/patrimonio", "/cierre"];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num grid h-5 min-w-5 place-items-center rounded-md border border-current/25 px-1 font-sans text-[11px] font-semibold opacity-70">
      {children}
    </kbd>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { openSheet, toastMsg, pendingCount, sheet, purchaseSheet } = useStore();
  const prelaunch = usePrelaunch();
  useIosViewportFix();
  // En modo preparación solo están habilitados Fijos y Perfil
  const blocked = prelaunch && (path === "/" || path === "/movimientos");
  const items = NAV.filter((i) => !prelaunch || (i !== null && i.href !== "/movimientos"));

  // Escritorio: N = anotar gasto, I = ingreso (no mientras escribís ni con una hoja abierta)
  const sheetOpen = sheet.open || purchaseSheet.open;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || sheetOpen || prelaunch) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === "n" || k === "i") {
        e.preventDefault();
        openSheet({ kind: k === "n" ? "expense" : "income" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSheet, sheetOpen, prelaunch]);

  // Atajos del ícono de la app: /?add=expense | /?add=income
  useEffect(() => {
    const kind = new URLSearchParams(window.location.search).get("add");
    if (kind === "expense" || kind === "income") {
      if (!prelaunch) openSheet({ kind });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [openSheet, prelaunch]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(max(0.5rem,env(safe-area-inset-top))+0.5rem)] lg:max-w-none lg:pb-14 lg:pl-[calc(15.5rem+2.5rem)] lg:pr-10 lg:pt-8">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] flex-col border-r border-line bg-bg px-3 py-6 lg:flex">
        <Link href="/" className="mb-6 flex items-baseline gap-2 px-3">
          <span className="text-xl font-semibold tracking-tight">Gastos</span>
        </Link>
        {!prelaunch && (
          <button
            onClick={() => openSheet()}
            className="press mx-1 mb-6 flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90"
          >
            <PlusIcon width={18} height={18} />
            <span className="flex-1 text-left">Anotar</span>
            <Kbd>N</Kbd>
          </button>
        )}
        <nav aria-label="Secciones" className="grid gap-0.5 text-sm">
          {SIDE.filter((i) => !prelaunch || i.prelaunch).map((item) => {
            const on = sideActive(path, item.href, [...(item.also ?? []), ...(item.sub?.flatMap((s) => [s.href, ...(s.also ?? [])]) ?? [])]);
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on && !item.sub ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 font-medium transition-colors ${on ? "bg-inset text-fg" : "text-muted hover:bg-surface hover:text-fg"}`}
                >
                  <span className="grid w-5 place-items-center">{item.icon}</span>
                  {item.label}
                </Link>
                {item.sub && (
                  <div className="mb-1 ml-[1.375rem] mt-0.5 grid gap-0.5 border-l border-line pl-3">
                    {item.sub.map((s) => {
                      const subOn = sideActive(path, s.href, s.also);
                      return (
                        <Link
                          key={s.href}
                          href={s.href}
                          aria-current={subOn ? "page" : undefined}
                          className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${subOn ? "font-semibold text-fg" : "text-muted hover:text-fg"}`}
                        >
                          {s.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-3 px-3 text-xs text-muted">
          {pendingCount > 0 && (
            <p className="flex items-center gap-2">
              <CloudOffIcon width={14} height={14} />
              {pendingCount} sin sincronizar
            </p>
          )}
          {!prelaunch && (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Kbd>N</Kbd> gasto <span className="text-line">·</span> <Kbd>I</Kbd> ingreso
            </p>
          )}
        </div>
      </aside>
      <div className={`mx-auto w-full ${WIDE.includes(path) ? "lg:max-w-[72rem]" : "lg:max-w-[46rem]"}`}>
      {pendingCount > 0 && (
        <div className="fade-in mb-3 flex lg:hidden items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-muted">
          <CloudOffIcon width={16} height={16} />
          {pendingCount} movimiento{pendingCount > 1 ? "s" : ""} esperando conexión
        </div>
      )}
      {/* Fondo detrás de la barra de estado del iPhone: sólido (el desenfoque ensuciaba el encabezado en iOS) */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-bg" />
      {prelaunch && !blocked && <PrelaunchBanner />}
      {blocked ? <PrelaunchCard /> : children}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-2xl lg:hidden"
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
        <div role="status" aria-live="polite" className="pop pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-6 lg:bottom-8 lg:pl-[15.5rem]">
          <div className="glass rounded-full px-4 py-2.5 text-sm font-medium">{toastMsg}</div>
        </div>
      )}
    </div>
  );
}
