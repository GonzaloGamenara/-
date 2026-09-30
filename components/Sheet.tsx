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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`sheet-in relative w-full max-w-lg overflow-y-auto rounded-t-[32px] border border-line bg-bg/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur-2xl sm:rounded-[32px] ${
          tall ? "max-h-[96dvh]" : "max-h-[88dvh]"
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Cerrar" className="press grid size-9 place-items-center rounded-full bg-surface">
              <XIcon width={18} height={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
