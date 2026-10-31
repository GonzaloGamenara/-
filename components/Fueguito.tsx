"use client";

import { useId } from "react";
import type { StreakStatus } from "@/lib/racha";

export type FuegoState = StreakStatus | "encender";

/**
 * Fueguito de la racha (SVG puro; las animaciones viven en globals.css bajo .fuego).
 * `compact` recorta el aire de arriba para usarlo al lado de un número.
 */
export function Fueguito({ state, size = 24, compact = false, className = "" }: { state: FuegoState; size?: number; compact?: boolean; className?: string }) {
  // Ids propios por instancia: varios fueguitos en la misma pantalla no se pisan los gradientes
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = (n: string) => `${n}-${id}`;
  const url = (n: string) => `url(#${g(n)})`;
  const [w, h] = compact ? [size, Math.round((size * 64) / 56)] : [size, Math.round(size * 1.25)];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={compact ? "4 14 56 64" : "0 0 64 80"}
      width={w}
      height={h}
      className={`fuego ${state === "activa" ? "" : state} ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={g("ext")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff3d2e" />
          <stop offset="0.55" stopColor="#ff6a1a" />
          <stop offset="1" stopColor="#ffb02e" />
        </linearGradient>
        <linearGradient id={g("med")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#ffd23f" />
        </linearGradient>
        <linearGradient id={g("nuc")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffda66" />
          <stop offset="1" stopColor="#fff8d6" />
        </linearGradient>
        <radialGradient id={g("bri")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
        </radialGradient>
        <filter id={g("suave")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* Resplandor en la base */}
      <path
        className="brillo"
        filter={url("suave")}
        fill={url("bri")}
        d="M10 72 C10 64 21 60 32 60 C43 60 54 64 54 72 C54 79 43 80 32 80 C21 80 10 79 10 72 Z"
      />

      {/* Onda expansiva al sumar un día */}
      <circle className="onda" cx="32" cy="52" r="18" fill="none" stroke="#ffb02e" strokeWidth="4" opacity="0" />

      <g className="llama">
        <path
          className="capa externa"
          fill={url("ext")}
          d="M 56 50 A 24 22 0 0 1 8 50 L 8 37 A 6.5 6.5 0 0 1 19.5 33 L 23.5 36.5 L 29.5 21 A 5.8 5.8 0 0 1 40 21 C 48 30 56 39 56 50 Z"
        />
        <g className="capa media">
          <path
            fill={url("med")}
            d="M 50 51 A 18 17 0 0 1 14 51 L 14 41 A 5 5 0 0 1 22.8 38 L 26 40.5 L 30.8 28.5 A 4.5 4.5 0 0 1 39 28.5 C 45 35.5 50 42.5 50 51 Z"
          />
          <rect className="brillo-pildora" x="37.5" y="28" width="6.5" height="14" rx="3.25" transform="rotate(-35 40.5 35)" fill="#fff3b0" opacity="0.7" />
        </g>
        <path
          className="nucleo"
          fill={url("nuc")}
          d="M 40.5 56.5 A 8 8 0 0 1 24.5 56.5 C 24.5 51 28.5 46.5 30.3 42.2 A 2.4 2.4 0 0 1 34.7 42.2 C 36.5 46.5 40.5 51 40.5 56.5 Z"
        />
      </g>

      {/* Chispas */}
      <path className="chispa c1" fill="#ffd23f" style={{ ["--dx" as string]: "4px" }} d="M40 22 L41.4 24 L40 26 L38.6 24 Z" />
      <path className="chispa c2" fill="#ffb02e" style={{ ["--dx" as string]: "-5px" }} d="M24 26 L25.2 27.8 L24 29.6 L22.8 27.8 Z" />
      <path className="chispa c3" fill="#fff3b0" style={{ ["--dx" as string]: "2px" }} d="M33 14 L34 15.6 L33 17.2 L32 15.6 Z" />

      {/* Brasa: racha perdida */}
      <g className="brasa">
        <path fill="#4b5563" d="M19 72 C19 66 25 63 32 63 C39 63 45 66 45 72 C45 76.5 39 77.5 32 77.5 C25 77.5 19 76.5 19 72 Z" />
        <path fill="#6b7280" d="M23 70 C24 67 28 65.5 32 65.5 C36 65.5 40 67 41 70 C37 69 35 68.6 32 68.6 C29 68.6 26 69 23 70 Z" />
        <path
          fill="#f97316"
          opacity="0.8"
          d="M27 72.5 C29 71.2 31 71 32.5 71.6 C34.5 72.4 36 72.2 37.5 71.4 C36.5 73.2 34.5 73.8 32.5 73.3 C30.5 72.8 28.8 73.4 27 72.5 Z"
        />
      </g>
    </svg>
  );
}
