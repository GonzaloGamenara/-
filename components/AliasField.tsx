"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { copyText } from "@/lib/share";

/** Tu alias de Mercado Pago / CBU (va en el mensaje cuando pedís plata). */
export function AliasField({ compact = false }: { compact?: boolean }) {
  const { alias, saveAlias, toast, hideAmounts } = useStore();
  const [value, setValue] = useState(alias);
  const [editing, setEditing] = useState(!alias);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(alias);
    setEditing(!alias);
  }, [alias]);

  const wrap = compact ? "grid gap-1.5 rounded-2xl bg-inset p-3" : "grid gap-1.5";

  if (!editing) {
    return (
      <div className={`${wrap} !flex items-center gap-3`}>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">Cobrás a</span>
          <span className="block truncate font-semibold">{hideAmounts ? "••••••••" : alias}</span>
        </span>
        <button
          onClick={async () => toast((await copyText(alias)) ? "Alias copiado ✓" : "No se pudo copiar")}
          className="press rounded-full bg-inset px-3 py-1.5 text-xs font-semibold"
        >
          Copiar
        </button>
        <button onClick={() => setEditing(true)} className="press px-1 text-xs font-medium text-accent2">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <label htmlFor="alias" className="text-sm font-medium">
        Tu alias para cobrar
        <span className="block text-xs font-normal text-muted">Mercado Pago, CBU o CVU. Va en el mensaje cuando pedís plata.</span>
      </label>
      <div className="flex gap-2">
        <input
          id="alias"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ej: gonza.mp"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={60}
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-fg placeholder:text-muted/70 focus:border-accent2"
        />
        <button
          onClick={async () => {
            setBusy(true);
            await saveAlias(value);
            setBusy(false);
          }}
          disabled={value.trim() === alias || busy || !value.trim()}
          className="press shrink-0 rounded-xl bg-fg px-4 text-sm font-semibold text-bg disabled:opacity-30"
        >
          {busy ? "…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
