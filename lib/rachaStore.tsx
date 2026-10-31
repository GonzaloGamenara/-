"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { useStore } from "./store";
import { todayISO } from "./format";
import { MILESTONES, streakOf, type DayKind } from "./racha";

interface RachaStore {
  ready: boolean;
  /** Falta correr la migración 007 */
  missing: boolean;
  days: Map<string, DayKind>;
  streak: ReturnType<typeof streakOf>;
  /** "Hoy no gasté nada": mantiene la racha sin tener que inventar un gasto */
  markNoSpend: () => Promise<void>;
  /** Hay un día recién sumado para festejar (se muestra cuando no hay una hoja abierta) */
  celebrate: number | null;
  consumeCelebration: () => void;
}

const Ctx = createContext<RachaStore | null>(null);
export const useRacha = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useRacha fuera de RachaProvider");
  return s;
};

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find/i.test(e.message ?? ""));

/** Días que no se pudieron subir (sin conexión): se reintentan al volver */
const pendingKey = (userId: string) => `gastos:racha-pendiente:${userId}`;
function readPending(userId: string): Record<string, DayKind> {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(userId)) ?? "{}");
  } catch {
    return {};
  }
}
function writePending(userId: string, v: Record<string, DayKind>) {
  try {
    if (Object.keys(v).length) localStorage.setItem(pendingKey(userId), JSON.stringify(v));
    else localStorage.removeItem(pendingKey(userId));
  } catch {
    /* sin storage: se pierde solo el reintento */
  }
}

export function RachaProvider({ children }: { children: ReactNode }) {
  const { userId, activity, toast } = useStore();
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [days, setDays] = useState<Map<string, DayKind>>(new Map());
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [today, setToday] = useState(todayISO);

  const flush = useCallback(async () => {
    const pending = readPending(userId);
    const rows = Object.entries(pending).map(([day, kind]) => ({ day, kind }));
    if (!rows.length) return;
    const { error } = await supabase().from("streak_days").upsert(rows, { onConflict: "user_id,day", ignoreDuplicates: true });
    if (!error) writePending(userId, {});
  }, [userId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase().from("streak_days").select("day,kind").order("day", { ascending: false }).limit(800);
      if (!alive) return;
      if (isMissing(error)) {
        setMissing(true);
        setReady(true);
        return;
      }
      const map = new Map<string, DayKind>(((data ?? []) as { day: string; kind: DayKind }[]).map((r) => [r.day, r.kind]));
      for (const [d, k] of Object.entries(readPending(userId))) if (!map.has(d)) map.set(d, k);
      setDays(map);
      setReady(true);
      flush();
    })();
    return () => {
      alive = false;
    };
  }, [userId, flush]);

  // El día cambia a medianoche (o si la app quedó abierta): recalculamos al volver
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setToday(todayISO());
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, []);

  const streak = useMemo(() => streakOf(new Set(days.keys()), today), [days, today]);
  const streakRef = useRef(streak);
  streakRef.current = streak;

  const daysRef = useRef(days);
  daysRef.current = days;

  const record = useCallback(
    async (kind: DayKind) => {
      const day = todayISO();
      setToday(day);
      if (daysRef.current.has(day)) return;
      const next = new Map(daysRef.current);
      next.set(day, kind);
      daysRef.current = next;
      setDays(next);
      setCelebrate(Date.now());
      const { error } = await supabase().from("streak_days").upsert({ day, kind }, { onConflict: "user_id,day", ignoreDuplicates: true });
      if (error) writePending(userId, { ...readPending(userId), [day]: kind });
    },
    [userId],
  );

  // Cada carga a mano suma el día (la primera del día dispara el festejo)
  const lastActivity = useRef(activity);
  useEffect(() => {
    if (!ready || missing || activity === lastActivity.current) return;
    lastActivity.current = activity;
    record("carga");
    flush();
  }, [activity, ready, missing, record, flush]);

  const markNoSpend = useCallback(async () => {
    await record("sin_gastos");
    toast("Día sin gastos anotado ✓ La racha sigue");
  }, [record, toast]);

  const consumeCelebration = useCallback(() => {
    setCelebrate(null);
    const n = streakRef.current.current;
    if (MILESTONES.includes(n)) toast(`🔥 ¡${n} días seguidos cargando!`);
  }, [toast]);

  const value = useMemo<RachaStore>(
    () => ({ ready, missing, days, streak, markNoSpend, celebrate, consumeCelebration }),
    [ready, missing, days, streak, markNoSpend, celebrate, consumeCelebration],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
