"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useShared } from "@/lib/sharedStore";
import { copyText, shareText } from "@/lib/share";
import { Sheet } from "./Sheet";

/** Compartir una cuenta por link: los demás la ven (solo lectura) sin instalar nada. */
export function ShareGroupSheet({ groupId, groupName, token, onClose }: { groupId: string; groupName: string; token: string | null | undefined; onClose: () => void }) {
  const { displayName, saveDisplayName, toast } = useStore();
  const { shareGroup, unshareGroup } = useShared();
  const [name, setName] = useState(displayName);
  const [link, setLink] = useState(token ? `${location.origin}/c/${token}` : "");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    if (name.trim() && name.trim() !== displayName) await saveDisplayName(name);
    const t = await shareGroup(groupId);
    setBusy(false);
    if (t) setLink(`${location.origin}/c/${t}`);
  };

  return (
    <Sheet open onClose={onClose} title="Compartir la cuenta">
      <div className="grid gap-4">
        <p className="-mt-2 text-sm text-muted">
          Quien tenga el link ve quién pagó qué y cuánto tiene que pasar, sin instalar nada. No puede editar.
        </p>

        {!link ? (
          <>
            <label className="grid gap-1.5 text-sm text-muted">
              ¿Cómo te llaman? (así te ven los demás, en vez de “Vos”)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Gonza"
                autoComplete="off"
                maxLength={30}
                className="w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg placeholder:text-muted/70 focus:border-accent2"
              />
            </label>
            <button disabled={busy || !name.trim()} onClick={create} className="press rounded-2xl bg-accent2 py-3.5 font-semibold text-black disabled:opacity-35">
              {busy ? "Creando link…" : "Crear link"}
            </button>
          </>
        ) : (
          <>
            <div className="truncate rounded-xl bg-inset px-4 py-3 font-mono text-xs">{link}</div>
            <button
              onClick={() => shareText(`Cuenta "${groupName}": mirá quién pagó qué y cuánto le toca a cada uno 👇\n${link}`)}
              className="press rounded-2xl bg-[#25D366] py-3.5 font-semibold text-black"
            >
              Enviar por WhatsApp
            </button>
            <button
              onClick={async () => toast((await copyText(link)) ? "Link copiado ✓" : "No se pudo copiar")}
              className="press rounded-2xl bg-inset py-3 font-semibold"
            >
              Copiar link
            </button>
            <button
              onClick={async () => {
                if (!confirm("¿Dejar de compartir? El link actual va a dejar de funcionar.")) return;
                await unshareGroup(groupId);
                onClose();
              }}
              className="text-sm text-exp underline"
            >
              Dejar de compartir
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
