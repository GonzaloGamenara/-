"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { copyText } from "@/lib/share";
import { Sheet } from "@/components/Sheet";
import { ChevronLeft } from "@/components/Icons";

interface AgentToken {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Token aleatorio de 256 bits: se muestra una sola vez; en Supabase queda solo su hash */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `gst_${b64}`;
}
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "") : "nunca";

export default function Agente() {
  const { toast } = useStore();
  const [tokens, setTokens] = useState<AgentToken[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("Claude");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    const { data, error } = await supabase().from("agent_tokens").select("id,label,created_at,last_used_at,revoked_at").order("created_at", { ascending: false });
    if (error) {
      setMissing(/does not exist|could not find/i.test(error.message) || error.code === "42P01" || error.code === "PGRST205");
      setTokens([]);
      return;
    }
    setTokens((data ?? []) as AgentToken[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    const token = newToken();
    const { error } = await supabase()
      .from("agent_tokens")
      .insert({ label: label.trim() || "Mi agente", token_hash: await sha256Hex(token) });
    setBusy(false);
    if (error) return toast("No se pudo crear: " + error.message);
    setCreating(false);
    setCreated(token);
    load();
  };

  const revoke = async (t: AgentToken) => {
    if (!confirm(`¿Revocar “${t.label}”? El agente que lo use deja de tener acceso al instante.`)) return;
    const { error } = await supabase().from("agent_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return toast(error.message);
    toast("Token revocado ✓");
    load();
  };

  const copy = async (text: string, what: string) => toast((await copyText(text)) ? `${what} copiado ✓` : "No se pudo copiar");
  const active = tokens?.filter((t) => !t.revoked_at) ?? [];
  const revoked = tokens?.filter((t) => t.revoked_at) ?? [];

  return (
    <div className="grid gap-5">
      <header className="rise flex items-center gap-2 pt-1">
        <Link href="/ajustes" aria-label="Volver" className="press -ml-2 grid size-10 place-items-center rounded-full">
          <ChevronLeft width={22} height={22} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Agente de IA</h1>
          <p className="mt-0.5 text-sm text-muted">Tus finanzas para tu agente, solo lectura</p>
        </div>
      </header>

      <section className="glass rise grid gap-2 rounded-3xl p-4 text-sm">
        <p>
          Creá un <b>token</b> y dáselo a tu agente (por ejemplo, Claude). Con él puede consultar por <b>GET</b> lo mismo que el export: resumen por mes,
          categorías, fijos, tarjetas, techos, patrimonio y movimientos.
        </p>
        <p className="text-muted">Es de solo lectura: con el token nadie puede cargar, cambiar ni borrar nada. Si se filtra, lo revocás y deja de andar al instante.</p>
      </section>

      {missing ? (
        <div className="glass rounded-3xl border-l-4 border-l-exp p-4 text-sm">
          <b>Falta un paso en Supabase.</b>
          <p className="mt-1 text-muted">
            Corré <code className="text-fg">supabase/migrations/010_agente.sql</code> en Supabase → SQL Editor → Run y recargá la app.
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Tokens activos</h2>
            <ul className="glass rise grid divide-y divide-line overflow-hidden rounded-3xl">
              {tokens === null && <li className="px-4 py-3.5 text-sm text-muted">Cargando…</li>}
              {tokens !== null && !active.length && <li className="px-4 py-3.5 text-sm text-muted">Todavía no creaste ninguno.</li>}
              {active.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inset text-lg">🤖</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.label}</span>
                    <span className="block truncate text-xs text-muted">
                      Creado {when(t.created_at)} · último uso {when(t.last_used_at)}
                    </span>
                  </span>
                  <button onClick={() => revoke(t)} className="press shrink-0 rounded-full bg-inset px-3 py-1.5 text-xs font-semibold text-exp">
                    Revocar
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <button onClick={() => setCreating(true)} className="press rounded-2xl bg-fg py-3.5 font-semibold text-bg">
            Crear token
          </button>

          <section className="glass rise grid gap-2 rounded-3xl p-4 text-sm">
            <h2 className="font-semibold">Cómo lo usa tu agente</h2>
            <code className="block overflow-x-auto whitespace-pre rounded-xl bg-inset p-3 text-xs">
              {`GET ${origin}/api/agente\nAuthorization: Bearer <tu token>`}
            </code>
            <p className="text-muted">
              Si tu agente solo puede abrir una URL, pasá el token en la dirección: <code className="text-fg">/api/agente?token=…</code> (queda en el historial
              del agente: revocalo si lo compartís).
            </p>
            <ul className="grid gap-1 text-muted">
              <li>
                <code className="text-fg">rango</code>: <code>mes</code>, <code>3m</code> (por defecto), <code>12m</code> o <code>todo</code>
              </li>
              <li>
                <code className="text-fg">formato</code>: <code>md</code> (por defecto, con explicación) o <code>json</code>
              </li>
            </ul>
          </section>

          {revoked.length > 0 && (
            <details className="px-1 text-sm text-muted">
              <summary className="cursor-pointer">Revocados ({revoked.length})</summary>
              <ul className="mt-2 grid gap-1">
                {revoked.map((t) => (
                  <li key={t.id}>
                    {t.label} · revocado {when(t.revoked_at)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {creating && (
        <Sheet open onClose={() => setCreating(false)} title="Nuevo token">
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm text-muted">
              ¿Para quién es?
              <input
                className="w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg outline-none focus:border-accent2"
                value={label}
                maxLength={40}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Claude, mi asesor…"
              />
            </label>
            <button onClick={create} disabled={busy} className="press rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink disabled:opacity-50">
              {busy ? "Creando…" : "Crear"}
            </button>
          </div>
        </Sheet>
      )}

      {created && (
        <Sheet open onClose={() => setCreated(null)} title="Tu token">
          <div className="grid gap-3 text-sm">
            <p className="rounded-2xl bg-amber-500/15 px-3 py-2 text-amber-700 dark:text-amber-300">
              Copialo ahora: <b>no se vuelve a mostrar</b>. Si lo perdés, creá otro y revocá este.
            </p>
            <code className="block break-all rounded-xl bg-inset p-3 text-xs">{created}</code>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copy(created, "Token")} className="press rounded-2xl bg-fg py-3 font-semibold text-bg">
                Copiar token
              </button>
              <button onClick={() => copy(`${origin}/api/agente?token=${created}`, "Link")} className="press rounded-2xl bg-inset py-3 font-semibold">
                Copiar link
              </button>
            </div>
            <p className="text-muted">
              Para tu agente: “Consultá mis finanzas en <code className="text-fg">{origin}/api/agente</code> con el header{" "}
              <code className="text-fg">Authorization: Bearer &lt;token&gt;</code> antes de asesorarme”.
            </p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
