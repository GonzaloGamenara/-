"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { buildDataset, toMarkdown } from "@/lib/exporter";
import { MiniMarkdown } from "@/components/MiniMarkdown";
import { PageHeader } from "@/components/PageHeader";

type Msg = { role: "user" | "assistant"; content: string; sources?: { title: string; url: string }[]; error?: boolean };

const STORE_KEY = "gastos:asesor:v1";
const SUGERENCIAS = [
  "¿Cómo vengo este mes?",
  "¿Qué hago con la plata que tengo en las cuentas?",
  "Armame un plan de inversión con mis números",
  "¿En qué estoy gastando de más?",
];

function loadChat(): Msg[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
}

export default function Asesor() {
  const { alias, hideAmounts } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Tus datos se leen al abrir la pantalla: el asesor siempre arranca con lo último
  const buildContext = useCallback(async () => {
    setCtxError(null);
    try {
      const d = await buildDataset("12m", alias);
      const ctx = toMarkdown(d, { json: false });
      setContext(ctx);
      return ctx;
    } catch (e) {
      setCtxError((e as Error)?.message ?? "No pude leer tus datos");
      return null;
    }
  }, [alias]);

  useEffect(() => {
    setMsgs(loadChat());
    buildContext();
  }, [buildContext]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-60)));
    } catch {
      /* sin storage: la charla vive solo en esta pantalla */
    }
  }, [msgs]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, status]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const ctx = context ?? (await buildContext());
    if (!ctx) return;
    const history: Msg[] = [...msgs.filter((m) => !m.error), { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("Pensando…");
    const ctrl = new AbortController();
    abort.current = ctrl;

    const patchLast = (f: (m: Msg) => Msg) => setMsgs((p) => [...p.slice(0, -1), f(p[p.length - 1])]);
    try {
      const { data } = await supabase().auth.getSession();
      const res = await fetch("/api/asesor", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ context: ctx, messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Error ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; v?: unknown };
          if (ev.t === "text") {
            setStatus(null);
            patchLast((m) => ({ ...m, content: m.content + String(ev.v) }));
          } else if (ev.t === "status") setStatus(String(ev.v));
          else if (ev.t === "sources") {
            const add = ev.v as { title: string; url: string }[];
            patchLast((m) => ({ ...m, sources: [...(m.sources ?? []), ...add.filter((s) => !m.sources?.some((x) => x.url === s.url))] }));
          } else if (ev.t === "error") throw new Error(String(ev.v));
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) {
        patchLast((m) => (m.content ? { ...m, content: m.content + "\n\n_(Cortado.)_" } : { ...m, content: "Cortado.", error: true }));
      } else {
        const msg = (e as Error)?.message ?? "Algo falló";
        patchLast((m) => (m.content ? { ...m, content: `${m.content}\n\n_(${msg})_` } : { ...m, content: msg, error: true }));
      }
    } finally {
      setBusy(false);
      setStatus(null);
      abort.current = null;
    }
  };

  const reset = () => {
    abort.current?.abort();
    setMsgs([]);
    buildContext();
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Asesor"
        subtitle="Claude, con todos tus números"
        right={
          msgs.length > 0 && (
            <button onClick={reset} className="press rounded-full bg-surface px-3.5 py-2 text-sm font-medium">
              Nueva charla
            </button>
          )
        }
      />

      {msgs.length === 0 ? (
        <section className="glass rise grid gap-4 rounded-3xl p-5">
          <div className="grid gap-1.5">
            <span className="text-3xl">✨</span>
            <h2 className="text-lg font-semibold">Preguntale lo que quieras sobre tu plata</h2>
            <p className="text-sm text-muted">
              Ve tus gastos, fijos, tarjetas y patrimonio tal como están en la app, y busca en internet tasas y precios del día cuando hace falta.
            </p>
          </div>
          <div className="grid gap-2">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={busy || (!context && !ctxError)}
                className="press rounded-2xl bg-inset px-4 py-3 text-left text-sm font-medium disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{context ? "Datos leídos ✓" : ctxError ? `No pude leer tus datos: ${ctxError}` : "Leyendo tus datos…"}</p>
        </section>
      ) : (
        <ul className="grid gap-4">
          {msgs.map((m, i) => (
            <li key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-fg px-4 py-2.5 text-[15px] text-bg">{m.content}</div>
              ) : m.error ? (
                <div className="rounded-2xl bg-exp/10 px-4 py-3 text-sm text-exp">
                  {m.content}
                  {i === msgs.length - 1 && (
                    <button
                      onClick={() => {
                        const lastUser = [...msgs].reverse().find((x) => x.role === "user");
                        setMsgs((p) => p.slice(0, -2));
                        if (lastUser) setTimeout(() => send(lastUser.content), 0);
                      }}
                      className="ml-2 font-semibold underline underline-offset-4"
                    >
                      Reintentar
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-2" {...(hideAmounts ? { "data-monto": true } : {})}>
                  {m.content ? <MiniMarkdown text={m.content} /> : null}
                  {m.sources && m.sources.length > 0 && (
                    <details className="text-xs text-muted">
                      <summary className="cursor-pointer">Fuentes ({m.sources.length})</summary>
                      <ul className="mt-1.5 grid gap-1">
                        {m.sources.map((s) => (
                          <li key={s.url} className="truncate">
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                              {s.title || s.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </li>
          ))}
          {status && (
            <li className="flex items-center gap-2 text-sm text-muted">
              <span className="size-2 animate-pulse rounded-full bg-accent" />
              {status}
            </li>
          )}
        </ul>
      )}

      <div ref={bottom} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-3 pt-6"
      >
        <div className="flex items-end gap-2 rounded-3xl border border-line bg-surface p-1.5 pl-4 shadow-lg">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // En compu: Enter manda, Shift+Enter baja de línea. En el celu se usa el botón.
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={Math.min(5, Math.max(1, input.split("\n").length))}
            autoComplete="off"
            placeholder="Preguntale a tu asesor…"
            className="max-h-36 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-[16px] outline-none placeholder:text-muted"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="press grid size-10 shrink-0 place-items-center rounded-full bg-inset" aria-label="Cortar">
              <span className="size-3 rounded-sm bg-fg" />
            </button>
          ) : (
            <button
              disabled={!input.trim()}
              aria-label="Enviar"
              className="press grid size-10 shrink-0 place-items-center rounded-full text-accent-ink disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
