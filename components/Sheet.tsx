"use client";

import { useEffect, type ReactNode } from "react";
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 touch-none bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`sheet-in relative w-full max-w-lg overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[32px] border border-line bg-bg/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur-2xl sm:rounded-[32px] ${
          tall ? "max-h-[96dvh]" : "max-h-[88dvh]"
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
