"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { XIcon } from "./Icons";

export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  tall?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // iOS ignora overflow:hidden en el body: lo fijamos en su lugar y lo restauramos al cerrar
    const body = document.body.style;
    const locked = body.position === "fixed";
    const y = locked ? 0 : window.scrollY;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    if (!locked) Object.assign(body, { position: "fixed", top: `-${y}px`, width: "100%", overflow: "hidden" });
    return () => {
      document.removeEventListener("keydown", onKey);
      if (!locked) {
        Object.assign(body, prev);
        window.scrollTo(0, y);
      }
    };
  }, [open, onClose]);

  // Con el teclado abierto, iOS achica el área visible pero no el layout: acomodamos la hoja
  // al área visible real (justo arriba del teclado) en vez de dejar que empuje toda la vista.
  const [vv, setVv] = useState<{ top: number; height: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const v = window.visualViewport;
    const update = () => {
      const keyboard = window.innerHeight - v.height > 120;
      setVv(keyboard ? { top: v.offsetTop, height: v.height } : null);
    };
    // Al enfocar un campo: solo si quedó tapado, lo movemos dentro de la hoja (nunca la pantalla)
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      const box = panel.current;
      if (!box?.contains(el) || !el.matches("input, textarea, select")) return;
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (r.top < b.top + 8) box.scrollBy({ top: r.top - b.top - 16, behavior: "smooth" });
        else if (r.bottom > b.bottom - 8) box.scrollBy({ top: r.bottom - b.bottom + 16, behavior: "smooth" });
      }, 300);
    };
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocus);
    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center sm:items-center"
      // Con teclado: la hoja ocupa el área visible, respetando la barra de estado del iPhone
      style={vv ? { top: vv.top, height: vv.height, paddingTop: "calc(env(safe-area-inset-top) + 8px)" } : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className="fade-in absolute inset-0 touch-none bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panel}
        className={`sheet-in relative w-full max-w-lg overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[32px] border border-line bg-bg/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur-2xl sm:rounded-[32px] ${
          vv ? "max-h-full rounded-b-none" : tall ? "max-h-[96dvh]" : "max-h-[88dvh]"
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Cerrar" className="press grid size-9 place-items-center rounded-full bg-inset">
              <XIcon width={18} height={18} />
            </button>
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)]">{children}</div>
      </div>
    </div>
  );
}
