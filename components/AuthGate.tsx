"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "@/lib/supabase";
import { DataProvider } from "@/lib/store";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    const db = supabase();
    db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <SetupNeeded />;
  if (!checked) return <div className="grid min-h-dvh place-items-center"><Logo /></div>;
  if (!session) return <Login />;
  return (
    <DataProvider userId={session.user.id} email={session.user.email ?? ""}>
      {children}
    </DataProvider>
  );
}

function Logo({ size = 56 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-[28%] font-extrabold text-[#10130a] pop"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: "linear-gradient(135deg, #c4f542, #5eead4)",
      }}
    >
      $
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const db = supabase();
    const { data, error } =
      mode === "in"
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMsg(
        /invalid login/i.test(error.message)
          ? "Email o contraseña incorrectos."
          : /already registered/i.test(error.message)
            ? "Ese email ya tiene cuenta. Ingresá."
            : /at least|weak/i.test(error.message)
              ? "La contraseña tiene que tener al menos 6 caracteres."
              : error.message,
      );
    } else if (mode === "up" && !data.session) {
      setMsg("Te mandamos un mail para confirmar la cuenta. Después ingresá acá.");
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-sm content-center gap-8 px-6 py-10">
      <div className="rise grid gap-4">
        <Logo size={64} />
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Gastos</h1>
          <p className="mt-2 text-muted">Anotá en segundos. Entendé a dónde se va tu plata.</p>
        </div>
      </div>

      <form onSubmit={submit} className="rise glass grid gap-3 rounded-3xl p-5" style={{ animationDelay: "80ms" }}>
        <label className="grid gap-1.5 text-sm text-muted">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-fg outline-none focus:border-accent2"
          />
        </label>
        <label className="grid gap-1.5 text-sm text-muted">
          Contraseña
          <span className="relative block">
            <input
              type={showPw ? "text" : "password"}
              required
              minLength={6}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface py-3 pl-4 pr-16 text-fg outline-none focus:border-accent2"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 right-3 text-xs font-medium text-muted"
              aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPw ? "Ocultar" : "Ver"}
            </button>
          </span>
        </label>
        {msg && <p className="text-sm text-exp">{msg}</p>}
        <button
          disabled={busy}
          className="press mt-1 rounded-2xl bg-accent px-4 py-3.5 font-semibold text-accent-ink disabled:opacity-60"
        >
          {busy ? "…" : mode === "in" ? "Ingresar" : "Crear cuenta"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="text-sm text-muted underline-offset-4 hover:underline"
        >
          {mode === "in" ? "No tengo cuenta · crear una" : "Ya tengo cuenta · ingresar"}
        </button>
      </form>
    </main>
  );
}

function SetupNeeded() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-6">
      <Logo />
      <h1 className="text-2xl font-semibold">Falta conectar Supabase</h1>
      <p className="text-muted">
        Definí <code className="text-fg">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
        <code className="text-fg">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (en <code>.env.local</code> o en las
        variables de entorno de Vercel) y volvé a desplegar. Los pasos están en el README.
      </p>
    </main>
  );
}
