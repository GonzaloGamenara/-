"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { txColumns, useStore } from "./store";
import { currentMonth, monthEnd, monthStart, uid } from "./format";
import { budgetItems, configFor, toConfig, weekOf, type Budget, type BudgetConfig, type BudgetItem } from "./techos";
import type { Transaction } from "./types";

export type BudgetInput = Omit<BudgetConfig, "id"> & { id?: string };

interface TechosStore {
  ready: boolean;
  /** Falta correr la migración 006 */
  missing: boolean;
  budgets: Budget[];
  /** Fotos mensuales: período → techos que regían */
  snapshots: Record<string, BudgetConfig[]>;
  /** Techos que regían en un mes (foto si es un mes cerrado) */
  configFor: (month: string) => BudgetConfig[];
  /** Techo de una categoría en un mes, si tiene */
  budgetOf: (categoryId: string | null, month: string) => BudgetConfig | null;
  saveBudget: (b: BudgetInput) => Promise<boolean>;
  saveMany: (list: BudgetInput[]) => Promise<boolean>;
  deleteBudget: (id: string) => Promise<void>;
}

const Ctx = createContext<TechosStore | null>(null);
export const useTechos = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useTechos fuera de TechosProvider");
  return s;
};

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find/i.test(e.message ?? ""));
const num = (v: unknown) => (v == null ? null : Number(v));

export function TechosProvider({ children }: { children: ReactNode }) {
  const { toast } = useStore();
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, BudgetConfig[]>>({});

  const load = useCallback(async () => {
    const db = supabase();
    const [b, bc, s] = await Promise.all([
      db.from("budgets").select("id,name,monthly,weekly,max_per_tx,allowed_days,sort").order("sort").order("created_at"),
      db.from("budget_categories").select("budget_id,category_id"),
      db.from("budget_snapshots").select("period,config"),
    ]);
    if (isMissing(b.error)) {
      setMissing(true);
      setReady(true);
      return;
    }
    if (b.error) {
      setReady(true);
      return;
    }
    const links = (bc.data ?? []) as { budget_id: string; category_id: string }[];
    setBudgets(
      ((b.data ?? []) as Omit<Budget, "category_ids">[]).map((x) => ({
        ...x,
        monthly: Number(x.monthly),
        weekly: num(x.weekly),
        max_per_tx: num(x.max_per_tx),
        allowed_days: x.allowed_days?.length ? x.allowed_days.map(Number) : null,
        category_ids: links.filter((l) => l.budget_id === x.id).map((l) => l.category_id),
      })),
    );
    setSnapshots(Object.fromEntries(((s.data ?? []) as { period: string; config: BudgetConfig[] }[]).map((r) => [r.period, r.config])));
    setMissing(false);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = useMemo(() => budgets.map(toConfig), [budgets]);

  // Foto del mes en curso: se actualiza sola cuando cambian los techos; al cerrar el mes queda fija
  useEffect(() => {
    if (!ready || missing) return;
    const period = currentMonth();
    const prev = snapshots[period];
    if (!prev && !current.length) return;
    if (prev && JSON.stringify(prev) === JSON.stringify(current)) return;
    const t = setTimeout(async () => {
      const { error } = await supabase()
        .from("budget_snapshots")
        .upsert({ period, config: current, updated_at: new Date().toISOString() }, { onConflict: "user_id,period" });
      if (!error) setSnapshots((s) => ({ ...s, [period]: current }));
    }, 800);
    return () => clearTimeout(t);
  }, [ready, missing, current, snapshots]);

  const cfgFor = useCallback((month: string) => configFor(month, current, snapshots, currentMonth()), [current, snapshots]);
  const budgetOf = useCallback(
    (categoryId: string | null, month: string) => (categoryId ? (cfgFor(month).find((b) => b.category_ids.includes(categoryId)) ?? null) : null),
    [cfgFor],
  );

  /** Guarda un techo y sus categorías (una categoría que estaba en otro techo se mueve a este) */
  const persist = useCallback(async (input: BudgetInput, sort: number) => {
    const db = supabase();
    const id = input.id ?? uid();
    const row = {
      name: input.name.trim(),
      monthly: input.monthly,
      weekly: input.weekly,
      max_per_tx: input.max_per_tx,
      allowed_days: input.allowed_days?.length ? input.allowed_days : null,
      updated_at: new Date().toISOString(),
    };
    const res = input.id ? await db.from("budgets").update(row).eq("id", id) : await db.from("budgets").insert({ id, ...row, sort });
    if (res.error) return res.error.message;
    const del = db.from("budget_categories").delete().eq("budget_id", id);
    const { error: e1 } = input.category_ids.length ? await del.not("category_id", "in", `(${input.category_ids.join(",")})`) : await del;
    if (e1) return e1.message;
    if (input.category_ids.length) {
      const { error: e2 } = await db
        .from("budget_categories")
        .upsert(
          input.category_ids.map((category_id) => ({ category_id, budget_id: id })),
          { onConflict: "category_id" },
        );
      if (e2) return e2.message;
    }
    return null;
  }, []);

  const saveBudget = useCallback(
    async (input: BudgetInput) => {
      const err = await persist(input, budgets.length);
      if (err) {
        toast("No se pudo guardar el techo: " + err);
        return false;
      }
      await load();
      toast(input.id ? "Techo actualizado ✓" : `Techo “${input.name.trim()}” creado ✓`);
      return true;
    },
    [persist, budgets.length, load, toast],
  );

  const saveMany = useCallback(
    async (list: BudgetInput[]) => {
      for (const [i, b] of list.entries()) {
        const err = await persist(b, budgets.length + i);
        if (err) {
          toast(`No se pudo crear “${b.name}”: ${err}`);
          await load();
          return false;
        }
      }
      await load();
      toast(`${list.length} techos creados ✓`);
      return true;
    },
    [persist, budgets.length, load, toast],
  );

  const deleteBudget = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("budgets").delete().eq("id", id);
      if (error) return toast(error.message);
      setBudgets((p) => p.filter((b) => b.id !== id));
      toast("Techo borrado");
    },
    [toast],
  );

  const value = useMemo<TechosStore>(
    () => ({ ready, missing, budgets, snapshots, configFor: cfgFor, budgetOf, saveBudget, saveMany, deleteBudget }),
    [ready, missing, budgets, snapshots, cfgFor, budgetOf, saveBudget, saveMany, deleteBudget],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Gastos ubicados para los techos de un mes (incluye la semana que arranca en el mes anterior).
 * Usa lo que la app ya tiene cargado; si es otro mes, lo trae aparte.
 */
export function useBudgetItems(month: string): BudgetItem[] | null {
  const { month: loaded, txs, prevTxs, purchases, splits } = useStore();
  const covered = month === loaded;
  const [fetched, setFetched] = useState<{ month: string; txs: Transaction[] } | null>(null);

  useEffect(() => {
    if (covered || fetched?.month === month) return;
    let alive = true;
    supabase()
      .from("transactions")
      .select(txColumns)
      .gte("occurred_on", weekOf(monthStart(month)).from)
      .lte("occurred_on", monthEnd(month))
      .then(({ data }) => {
        if (alive) setFetched({ month, txs: ((data ?? []) as unknown as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount) })) });
      });
    return () => {
      alive = false;
    };
  }, [covered, month, fetched?.month]);

  return useMemo(() => {
    if (covered) return budgetItems([...prevTxs, ...txs], purchases, splits);
    if (fetched?.month === month) return budgetItems(fetched.txs, purchases, splits);
    return null;
  }, [covered, prevTxs, txs, purchases, splits, fetched, month]);
}
