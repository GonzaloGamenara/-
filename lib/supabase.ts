import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDemoFetch, demoSession } from "./demo/mock";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Modo demo (/demo): la app entera funciona con datos ficticios en memoria, sin login y sin tocar
 * Supabase. Se mantiene mientras la pestaña esté abierta (sessionStorage), así se puede navegar.
 */
const DEMO_KEY = "gastos.demo";
let demoMode: boolean | null = null;
export function isDemo() {
  if (demoMode !== null) return demoMode;
  if (typeof window === "undefined") return false;
  const enter = window.location.pathname === "/demo" || window.location.pathname.startsWith("/demo/");
  try {
    if (enter) sessionStorage.setItem(DEMO_KEY, "1");
    demoMode = enter || sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    demoMode = enter;
  }
  return demoMode;
}
export function exitDemo() {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* nada */
  }
  window.location.href = "/";
}

export const isConfigured = Boolean(url && key) || isDemo();

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (client) return client;
  if (isDemo()) {
    const demoUrl = url ?? "https://demo.supabase.co";
    const mem = new Map<string, string>([["gastos-demo-auth", JSON.stringify(demoSession())]]);
    client = createClient(demoUrl, key ?? "demo", {
      auth: {
        storageKey: "gastos-demo-auth",
        storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) },
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: createDemoFetch(demoUrl) },
    });
    return client;
  }
  if (!url || !key) throw new Error("Supabase no está configurado");
  return (client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
}
