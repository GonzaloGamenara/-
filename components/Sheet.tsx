"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

  // Deslizar hacia abajo para cerrar: desde la manija o desde cualquier parte si la hoja está arriba de todo.
  // Solo arranca con un gesto claramente vertical, para no pelear con las listas que se deslizan de costado.
  const drag = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const el = drag.current;
    const box = panel.current;
    if (!open || !el || !box) return;
    let start: { x: number; y: number; t: number } | null = null;
    let active = false;
    let dy = 0;
    const set = (y: number, anim: boolean) => {
      el.style.transition = anim ? "transform .25s cubic-bezier(.2,.9,.25,1)" : "none";
      el.style.transform = y ? `translateY(${y}px)` : "";
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.target as HTMLElement;
      // En un campo de texto o con la hoja scrolleada, el gesto es de la hoja, no para cerrar
      if (t.closest("input, textarea, select") || (box.scrollTop > 0 && !t.closest("[data-sheet-handle]"))) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      active = false;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const mx = e.touches[0].clientX - start.x;
      const my = e.touches[0].clientY - start.y;
      if (!active) {
        if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) return void (start = null);
        if (my < 8) {
          if (my < -4) start = null;
          return;
        }
        active = true;
      }
      e.preventDefault();
      dy = Math.max(0, my);
      set(dy, false);
    };
    const onEnd = () => {
      if (!start) return;
      const fast = dy > 40 && dy / Math.max(1, Date.now() - start.t) > 0.5;
      start = null;
      if (!active) return;
      active = false;
      if (dy > 110 || fast) {
        set(window.innerHeight, true);
        setTimeout(() => onCloseRef.current(), 180);
      } else set(0, true);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  // Portal al body: así una hoja puede abrirse encima de otra (ej: crear categoría mientras cargás)
  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center sm:items-center"
      // Cubre también la franja de abajo que iOS a veces deja afuera del viewport (--ios-gap).
      // Con teclado: la hoja ocupa el área visible, respetando la barra de estado del iPhone.
      style={
        vv
          ? { top: vv.top, height: vv.height, paddingTop: "calc(env(safe-area-inset-top) + 8px)" }
          : { height: "calc(100dvh + var(--ios-gap, 0px))" }
      }
      role="dialog"
      aria-modal="true"
    >
      <div className="fade-in absolute inset-0 touch-none bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={drag} className={`relative w-full max-w-lg ${vv ? "h-full" : ""} flex items-end`}>
        <div
          ref={panel}
          className={`sheet-in relative w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-3xl border border-line bg-bg px-5 pt-2 shadow-2xl sm:rounded-2xl ${
            vv ? "max-h-full rounded-b-none" : tall ? "sheet-tall" : "sheet-normal"
          }`}
          style={vv ? { paddingBottom: "1.25rem" } : { paddingBottom: "calc(max(1.25rem, env(safe-area-inset-bottom)) + var(--ios-gap, 0px))" }}
        >
          {/* Manija: también se puede tocar para cerrar */}
          <button
            type="button"
            data-sheet-handle
            onClick={onClose}
            aria-label="Cerrar"
            className="mx-auto mb-2 flex h-5 w-16 items-center justify-center sm:hidden"
          >
            <span className="h-1 w-10 rounded-full bg-line" />
          </button>
          {title && (
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Cerrar" className="press grid size-9 shrink-0 place-items-center rounded-full bg-inset">
                <XIcon width={18} height={18} />
              </button>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)]">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
