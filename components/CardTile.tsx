import type { ReactNode } from "react";
import type { Card } from "@/lib/types";

/** Tarjeta visual con el color elegido. */
export function CardTile({ card, children, className = "" }: { card: Card; children?: ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] p-5 text-white shadow-[0_14px_40px_-16px_rgb(0_0_0/0.5)] ${className}`}
      style={{ background: `linear-gradient(135deg, ${card.color}, color-mix(in srgb, ${card.color} 50%, #000))` }}
    >
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 left-10 size-40 rounded-full bg-black/10 blur-2xl" />
      <div className="relative">{children}</div>
    </div>
  );
}
