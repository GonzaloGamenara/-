"use client";

import { useStore } from "@/lib/store";
import { EyeIcon, EyeOffIcon } from "./Icons";

/** Ojo para ocultar/mostrar todos los montos de la app. */
export function EyeToggle() {
  const { hideAmounts, toggleHideAmounts } = useStore();
  return (
    <button
      onClick={toggleHideAmounts}
      aria-label={hideAmounts ? "Mostrar montos" : "Ocultar montos"}
      aria-pressed={hideAmounts}
      className={`press grid size-10 shrink-0 place-items-center rounded-full ${hideAmounts ? "bg-fg text-bg" : "bg-surface text-muted"}`}
    >
      {hideAmounts ? <EyeOffIcon width={19} height={19} /> : <EyeIcon width={19} height={19} />}
    </button>
  );
}
