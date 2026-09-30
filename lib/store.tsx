"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import type { Category, Kind, Recurring, Transaction } from "./types";
import {
  addMonths,
  currentMonth,
  dueDate,
  monthEnd,
  monthStart,
  todayISO,
  uid,
} from "./format";

export const DEFAULT_CATEGORIES: Omit<Category, "id" | "sort">[] = [
  { name: "Supermercado", emoji: "🛒", color: "#34d399", kind: "expense" },
  { name: "Comida afuera", emoji: "🍔", color: "#fb923c", kind: "expense" },
  { name: "Transporte", emoji: "🚌", color: "#60a5fa", kind: "expense" },
  { name: "Vivienda", emoji: "🏠", color: "#a78bfa", kind: "expense" },
  { name: "Servicios", emoji: "💡", color: "#facc15", kind: "expense" },
  { name: "Suscripciones", emoji: "📺", color: "#f472b6", kind: "expense" },
  { name: "Salud", emoji: "💊", color: "#f87171", kind: "expense" },
  { name: "Estudio", emoji: "📚", color: "#22d3ee", kind: "expense" },
  { name: "Ropa", emoji: "👕", color: "#c084fc", kind: "expense" },
  { name: "Salidas", emoji: "🎉", color: "#fb7185", kind: "expense" },
  { name: "Regalos", emoji: "🎁", color: "#f9a8d4", kind: "expense" },
  { name: "Otros", emoji: "🧩", color: "#94a3b8", kind: "expense" },
  { name: "Sueldo", emoji: "💼", color: "#4ade80", kind: "income" },
  { name: "Beca", emoji: "🎓", color: "#2dd4bf", kind: "income" },
  { name: "Ventas", emoji: "🏷️", color: "#a3e635", kind: "income" },
  { name: "Otros ingresos", emoji: "✨", color: "#86efac", kind: "income" },
];

export interface NewTx {
  kind: Kind;
  amount: number;
  category_id: string | null;
  note?: string | null;
  occurred_on: string;
}

interface Store {
  userId: string;
  email: string;
  loading: boolean;
  month: string;
  setMonth: (m: string) => void;
  categories: Category[];
  recurring: Recurring[];
  /** Movimientos del mes seleccionado */
  txs: Transaction[];
  /** Movimientos del mes anterior (para comparar) */
  prevTxs: Transaction[];
  pendingCount: number;
  addTx: (t: NewTx) => Promise<void>;
  updateTx: (id: string, patch: Partial<NewTx>) => Promise<void>;
  deleteTx: (id: string) => Promise<void>;
  saveRecurring: (r: Partial<Recurring> & Pick<Recurring, "kind" | "name" | "amount">) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  saveCategory: (c: Partial<Category> & Pick<Category, "kind" | "name">) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string | null;
  sheet: SheetState;
  openSheet: (s?: Partial<SheetState>) => void;
  closeSheet: () => void;
}

export interface SheetState {
  open: boolean;
  editing?: Transaction | null;
  kind?: Kind;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fuera de DataProvider");
  return s;
};

const queueKey = (uid: string) => `gastos.queue.${uid}`;
const snapKey = (uid: string, m: string) => `gastos.snap.${uid}.${m}`;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage lleno o bloqueado: no es crítico */
  }
}

const isNetworkError = (e: { message?: string } | null | undefined) =>
  (typeof navigator !== "undefined" && !navigator.onLine) ||
  /fetch|network|load failed|timeout/i.test(e?.message ?? "");

const txColumns = "id,kind,amount,category_id,note,occurred_on,recurring_id,period";

export function DataProvider({
  userId,
  email,
  children,
}: {
  userId: string;
  email: string;
  children: ReactNode;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [allTxs, setAllTxs] = useState<Transaction[]>([]);
  const [queue, setQueue] = useState<Transaction[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const openSheet = useCallback(
    (s: Partial<SheetState> = {}) => setSheet({ open: true, editing: null, ...s }),
    [],
  );
  const closeSheet = useCallback(() => setSheet({ open: false }), []);

  // --- cola offline -------------------------------------------------------
  useEffect(() => setQueue(readJSON<Transaction[]>(queueKey(userId), [])), [userId]);
  const persistQueue = useCallback(
    (q: Transaction[]) => {
      setQueue(q);
      writeJSON(queueKey(userId), q);
    },
    [userId],
  );

  const flushQueue = useCallback(async () => {
    const q = readJSON<Transaction[]>(queueKey(userId), []);
    if (!q.length || !navigator.onLine) return;
    const rows = q.map(({ pending: _p, ...r }) => r);
    const { error } = await supabase()
      .from("transactions")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) return;
    persistQueue([]);
    setAllTxs((prev) => prev.map((t) => (t.pending ? { ...t, pending: false } : t)));
    toast(`${q.length} movimiento${q.length > 1 ? "s" : ""} sincronizado${q.length > 1 ? "s" : ""} ✓`);
  }, [userId, persistQueue, toast]);

  useEffect(() => {
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [flushQueue]);

  // --- carga --------------------------------------------------------------
  const seeded = useRef(false);
  const loadedFor = useRef<string>("");

  const load = useCallback(
    async (m: string) => {
      setLoading(true);
      const db = supabase();
      const from = monthStart(addMonths(m, -1));
      const to = monthEnd(m);
      try {
        const [catsRes, recs, txs] = await Promise.all([
          db.from("categories").select("*").order("sort").order("created_at"),
          db.from("recurring").select("*").order("day"),
          db
            .from("transactions")
            .select(txColumns)
            .gte("occurred_on", from)
            .lte("occurred_on", to)
            .order("occurred_on", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);
        const err = catsRes.error ?? recs.error ?? txs.error;
        if (err) throw err;
        let catRows = (catsRes.data ?? []) as Category[];

        // Primera vez: sembrar categorías por defecto
        if (!catRows.length && !seeded.current) {
          seeded.current = true;
          const seed = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: i }));
          const ins = await db.from("categories").insert(seed).select("*");
          if (ins.error) throw ins.error;
          catRows = ins.data as Category[];
        }

        let txData = (txs.data ?? []) as Transaction[];

        // Fijos del mes en curso: se generan solos cuando llega su día
        if (m === currentMonth()) {
          const today = todayISO();
          const have = new Set(txData.filter((t) => t.period === m).map((t) => t.recurring_id));
          const due = ((recs.data ?? []) as Recurring[])
            .filter((r) => r.active && !have.has(r.id) && dueDate(m, r.day) <= today)
            .map((r) => ({
              id: uid(),
              kind: r.kind,
              amount: r.amount,
              category_id: r.category_id,
              note: r.name,
              occurred_on: dueDate(m, r.day),
              recurring_id: r.id,
              period: m,
            }));
          if (due.length) {
            const ins = await db
              .from("transactions")
              .upsert(due, { onConflict: "recurring_id,period", ignoreDuplicates: true })
              .select(txColumns);
            if (!ins.error) {
              txData = [...(ins.data as Transaction[]), ...txData].sort((a, b) =>
                b.occurred_on.localeCompare(a.occurred_on),
              );
            }
          }
        }

        const catList = catRows;
        const recList = (recs.data ?? []) as Recurring[];
        setCategories(catList);
        setRecurring(recList);
        setAllTxs(txData);
        writeJSON(snapKey(userId, m), { catList, recList, txData });
        loadedFor.current = m;
        flushQueue();
      } catch {
        // Sin conexión: mostramos la última foto guardada
        const snap = readJSON<{ catList: Category[]; recList: Recurring[]; txData: Transaction[] } | null>(
          snapKey(userId, m),
          null,
        );
        if (snap) {
          setCategories(snap.catList);
          setRecurring(snap.recList);
          const q = readJSON<Transaction[]>(queueKey(userId), []).map((t) => ({ ...t, pending: true }));
          setAllTxs([...q, ...snap.txData]);
          toast("Sin conexión · mostrando datos guardados");
        } else {
          toast("No pude cargar los datos");
        }
      } finally {
        setLoading(false);
      }
    },
    [userId, flushQueue, toast],
  );

  useEffect(() => {
    load(month);
  }, [month, load]);

  // --- movimientos --------------------------------------------------------
  const addTx = useCallback(
    async (t: NewTx) => {
      const row: Transaction = {
        id: uid(),
        kind: t.kind,
        amount: t.amount,
        category_id: t.category_id,
        note: t.note?.trim() || null,
        occurred_on: t.occurred_on,
        recurring_id: null,
        period: null,
      };
      const insertOptimistic = (pending: boolean) =>
        setAllTxs((p) => [{ ...row, pending }, ...p].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)));
      insertOptimistic(false);
      const { error } = await supabase().from("transactions").insert(row);
      if (!error) return;
      if (isNetworkError(error)) {
        setAllTxs((p) => p.map((x) => (x.id === row.id ? { ...x, pending: true } : x)));
        persistQueue([...readJSON<Transaction[]>(queueKey(userId), []), row]);
        toast("Guardado sin conexión · se sube solo al volver internet");
      } else {
        setAllTxs((p) => p.filter((x) => x.id !== row.id));
        toast("No se pudo guardar: " + error.message);
      }
    },
    [userId, persistQueue, toast],
  );

  const updateTx = useCallback(
    async (id: string, patch: Partial<NewTx>) => {
      const before = allTxs.find((t) => t.id === id);
      setAllTxs((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await supabase().from("transactions").update(patch).eq("id", id);
      if (error) {
        if (before) setAllTxs((p) => p.map((t) => (t.id === id ? before : t)));
        toast(isNetworkError(error) ? "Sin conexión: no se pudo editar" : error.message);
      }
    },
    [allTxs, toast],
  );

  const deleteTx = useCallback(
    async (id: string) => {
      const before = allTxs.find((t) => t.id === id);
      setAllTxs((p) => p.filter((t) => t.id !== id));
      if (before?.pending) {
        persistQueue(readJSON<Transaction[]>(queueKey(userId), []).filter((t) => t.id !== id));
        return;
      }
      const { error } = await supabase().from("transactions").delete().eq("id", id);
      if (error && before) {
        setAllTxs((p) => [before, ...p]);
        toast(isNetworkError(error) ? "Sin conexión: no se pudo borrar" : error.message);
      }
    },
    [allTxs, userId, persistQueue, toast],
  );

  // --- fijos y categorías -------------------------------------------------
  const saveRecurring: Store["saveRecurring"] = useCallback(
    async (r) => {
      const db = supabase();
      const body = {
        kind: r.kind,
        name: r.name.trim(),
        amount: r.amount,
        category_id: r.category_id ?? null,
        day: r.day ?? 1,
        active: r.active ?? true,
      };
      const { error } = r.id
        ? await db.from("recurring").update(body).eq("id", r.id)
        : await db.from("recurring").insert(body);
      if (error) return toast(error.message);
      await load(month);
    },
    [load, month, toast],
  );

  const deleteRecurring = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("recurring").delete().eq("id", id);
      if (error) return toast(error.message);
      await load(month);
    },
    [load, month, toast],
  );

  const saveCategory: Store["saveCategory"] = useCallback(
    async (c) => {
      const db = supabase();
      const body = {
        kind: c.kind,
        name: c.name.trim(),
        emoji: c.emoji || "🏷️",
        color: c.color || "#8b5cf6",
      };
      const { error } = c.id
        ? await db.from("categories").update(body).eq("id", c.id)
        : await db.from("categories").insert({ ...body, sort: categories.length });
      if (error) return toast(error.message);
      await load(month);
    },
    [categories.length, load, month, toast],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("categories").delete().eq("id", id);
      if (error) return toast(error.message);
      await load(month);
    },
    [load, month, toast],
  );

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
  }, []);

  const prev = addMonths(month, -1);
  const txs = useMemo(() => allTxs.filter((t) => t.occurred_on.startsWith(month)), [allTxs, month]);
  const prevTxs = useMemo(() => allTxs.filter((t) => t.occurred_on.startsWith(prev)), [allTxs, prev]);

  const value: Store = {
    userId,
    email,
    loading,
    month,
    setMonth,
    categories,
    recurring,
    txs,
    prevTxs,
    pendingCount: queue.length,
    addTx,
    updateTx,
    deleteTx,
    saveRecurring,
    deleteRecurring,
    saveCategory,
    deleteCategory,
    signOut,
    toast,
    toastMsg,
    sheet,
    openSheet,
    closeSheet,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
