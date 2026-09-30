"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { debtMessage, shareText, type DebtItem } from "@/lib/share";
import { Sheet } from "./Sheet";

/** "Pedir": manda el mensaje con tu alias. Si todavía no cargaste el alias, lo pide en el momento. */
export function PedirButton({ name, items, className = "" }: { name: string; items: DebtItem[]; className?: string }) {
  const { alias, saveAlias } = useStore();
  const [asking, setAsking] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const send = (a: string) => shareText(debtMessage(name, items, a));

  return (
    <>
      <button
        onClick={() => (alias ? send(alias) : setAsking(true))}
        className={`press rounded-full bg-[#25D366] px-3.5 py-2 text-xs font-semibold text-black ${className}`}
      >
        Pedir
      </button>
      {asking && (
        <Sheet open onClose={() => setAsking(false)} title="¿A qué alias te transfieren?">
          <div className="grid gap-4">
            <p className="-mt-2 text-sm text-muted">Lo guardamos para que vaya en todos los mensajes. Lo cambiás cuando quieras en Perfil.</p>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ej: gonza.mp (Mercado Pago, CBU o CVU)"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              className="w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg placeholder:text-muted/70 focus:border-accent2"
            />
            <button
              disabled={!value.trim() || busy}
              onClick={async () => {
                setBusy(true);
                await saveAlias(value);
                setBusy(false);
                setAsking(false);
                send(value.trim());
              }}
              className="press rounded-2xl bg-[#25D366] py-3.5 font-semibold text-black disabled:opacity-35"
            >
              {busy ? "Guardando…" : "Guardar y pedir"}
            </button>
            <button onClick={() => (setAsking(false), send(""))} className="text-sm text-muted underline">
              Mandar sin alias
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
