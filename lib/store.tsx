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
import { usePrelaunch } from "@/components/LaunchGate";
import { launchMonth } from "./launch";
import { supabase } from "./supabase";
import { loadHidden, setHidden } from "./privacy";
import type { Card, Category, Kind, Purchase, Recurring, Split, Transaction } from "./types";
import { buildInstallments } from "./cards";
import {
  addMonths,
  currentMonth,
  dueDate,
  monthEnd,
  monthLabel,
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

/** Parte de otra persona en un gasto dividido */
export interface SplitShare {
  name: string;
  amount: number;
  settled_on?: string | null;
}

export interface PurchaseInput {
  id?: string;
  card_id: string;
  description: string;
  category_id: string | null;
  total_amount: number;
  installments: number;
  first_period: string;
  from_installment: number;
  purchased_on: string;
  splits: SplitShare[];
}

export interface PurchaseSheetState {
  open: boolean;
  purchase?: Purchase | null;
  cardId?: string | null;
  /** Valores iniciales para una compra nueva (ej: desde la calculadora de cuotas) */
  prefill?: { total_amount?: number; installments?: number; description?: string };
}

interface Store {
  userId: string;
  email: string;
  /** Alias de Mercado Pago/CBU para cobrar gastos divididos */
  alias: string;
  saveAlias: (alias: string) => Promise<void>;
  /** Tu nombre como lo ven los demás en una cuenta compartida */
  displayName: string;
  saveDisplayName: (name: string) => Promise<void>;
  /** Nombres usados antes al dividir (para sugerirlos) */
  recentNames: string[];
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
  cards: Card[];
  purchases: Purchase[];
  splits: Split[];
  /** Falta correr la migración 002 en Supabase */
  needsMigration: boolean;
  addTx: (t: NewTx, splits?: SplitShare[]) => Promise<boolean>;
  updateTx: (id: string, patch: Partial<NewTx>) => Promise<void>;
  deleteTx: (id: string) => Promise<void>;
  saveRecurring: (r: Partial<Recurring> & Pick<Recurring, "kind" | "name" | "amount">) => Promise<void>;
  saveCard: (c: Partial<Card> & Pick<Card, "name" | "due_day">) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  savePurchase: (p: PurchaseInput) => Promise<boolean>;
  deletePurchase: (id: string) => Promise<void>;
  settleSplit: (id: string, settled: boolean) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  /** Crea o edita una categoría; devuelve su id (o null si falló) */
  saveCategory: (c: Partial<Category> & Pick<Category, "kind" | "name">) => Promise<string | null>;
  deleteCategory: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string | null;
  sheet: SheetState;
  openSheet: (s?: Partial<SheetState>) => void;
  closeSheet: () => void;
  purchaseSheet: PurchaseSheetState;
  openPurchase: (s?: Partial<PurchaseSheetState>) => void;
  closePurchase: () => void;
  /** Modo privado: montos ocultos */
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
  /** Recarga todo (después de cambios hechos fuera del store) */
  reload: () => Promise<void>;
}

export interface SheetState {
  open: boolean;
  editing?: Transaction | null;
  kind?: Kind;
  /** Abrir directo en "Dividir" (funciona también en modo preparación) */
  split?: boolean;
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

const legacyTxColumns = "id,kind,amount,category_id,note,occurred_on,recurring_id,period";
export const txColumns = `${legacyTxColumns},card_id,purchase_id,installment,my_share`;
/** Error de Postgres/PostgREST por columna o tabla inexistente (migración sin correr) */
const isMissingSchema = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === "42703" || e.code === "42P01" || e.code === "PGRST200" || e.code === "PGRST204" || /does not exist|could not find/i.test(e.message ?? ""));

/** PostgREST devuelve numeric como número, pero por las dudas normalizamos */
const normalizeTx = (t: Transaction): Transaction => ({
  ...t,
  amount: Number(t.amount),
  my_share: t.my_share === null || t.my_share === undefined ? t.my_share : Number(t.my_share),
});

export function DataProvider({
  userId,
  email,
  initialAlias,
  children,
}: {
  userId: string;
  email: string;
  initialAlias: string;
  children: ReactNode;
}) {
  const [alias, setAlias] = useState(initialAlias);
  const [hideAmounts, setHideAmounts] = useState(() => {
    const v = typeof window !== "undefined" && loadHidden();
    setHidden(!!v);
    return !!v;
  });
  const toggleHideAmounts = useCallback(() => {
    setHideAmounts((v) => {
      setHidden(!v);
      return !v;
    });
  }, []);
  const [displayName, setDisplayName] = useState("");
  // El alias puede haberse cambiado desde otro dispositivo: lo refrescamos del servidor
  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => {
        const a = data.user?.user_metadata?.alias;
        if (typeof a === "string") setAlias(a);
        const n = data.user?.user_metadata?.name;
        if (typeof n === "string") setDisplayName(n);
      });
  }, []);
  const prelaunch = usePrelaunch();
  const prelaunchRef = useRef(prelaunch);
  prelaunchRef.current = prelaunch;
  // Antes del arranque el mes "activo" ya es el del lanzamiento (nunca septiembre)
  const [month, setMonth] = useState(() => (prelaunch ? launchMonth() : currentMonth()));
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [allTxs, setAllTxs] = useState<Transaction[]>([]);
  const [queue, setQueue] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [purchaseSheet, setPurchaseSheet] = useState<PurchaseSheetState>({ open: false });
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
  const openPurchase = useCallback(
    (s: Partial<PurchaseSheetState> = {}) => setPurchaseSheet({ open: true, purchase: null, ...s }),
    [],
  );
  const closePurchase = useCallback(() => setPurchaseSheet({ open: false }), []);

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
        const txQuery = (cols: string) =>
          db
            .from("transactions")
            .select(cols)
            .gte("occurred_on", from)
            .lte("occurred_on", to)
            .order("occurred_on", { ascending: false })
            .order("created_at", { ascending: false });
        const [catsRes, recs, txsNew, cardsRes, purchasesRes, splitsRes] = await Promise.all([
          db.from("categories").select("*").order("sort").order("created_at"),
          db.from("recurring").select("*").order("day"),
          txQuery(txColumns),
          db.from("cards").select("id,name,color,due_day").order("created_at"),
          db.from("purchases").select("id,card_id,description,category_id,total_amount,installments,first_period,from_installment,purchased_on").order("purchased_on", { ascending: false }),
          db.from("splits").select("id,transaction_id,purchase_id,name,amount,settled_on").order("created_at", { ascending: false }),
        ]);
        // Si todavía no se corrió la migración 002, seguimos funcionando con lo básico
        const missing = isMissingSchema(txsNew.error) || isMissingSchema(cardsRes.error);
        setNeedsMigration(missing);
        const txs = isMissingSchema(txsNew.error) ? await txQuery(legacyTxColumns) : txsNew;
        const err = catsRes.error ?? recs.error ?? txs.error;
        if (err) throw err;
        if (!missing) {
          const arr = <T,>(d: unknown) => (Array.isArray(d) ? (d as T[]) : []);
          setCards(arr<Card>(cardsRes.data));
          setPurchases(arr<Purchase>(purchasesRes.data).map((p) => ({ ...p, total_amount: Number(p.total_amount) })));
          setSplits(arr<Split>(splitsRes.data).map((x) => ({ ...x, amount: Number(x.amount) })));
        }
        let catRows = (catsRes.data ?? []) as Category[];

        // Primera vez: sembrar categorías por defecto
        if (!catRows.length && !seeded.current) {
          seeded.current = true;
          const seed = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sort: i }));
          const ins = await db.from("categories").insert(seed).select("*");
          if (ins.error) throw ins.error;
          catRows = ins.data as Category[];
        }

        let txData = ((txs.data ?? []) as unknown as Transaction[]).map(normalizeTx);

        // Fijos del mes en curso: se generan solos cuando llega su día
        if (m === currentMonth() && !prelaunchRef.current) {
          const today = todayISO();
          const have = new Set(txData.filter((t) => t.period === m).map((t) => t.recurring_id));
          const due = ((recs.data ?? []) as Recurring[])
            .filter(
              (r) =>
                r.active &&
                !have.has(r.id) &&
                dueDate(m, r.day) <= today &&
                // Una suscripción de tarjeta nueva no se cobra en un resumen que ya pasó
                !(r.card_id && r.created_at && dueDate(m, r.day) < r.created_at.slice(0, 10)),
            )
            .map((r) => ({
              id: uid(),
              kind: r.kind,
              amount: r.amount,
              category_id: r.category_id,
              note: r.name,
              occurred_on: dueDate(m, r.day),
              recurring_id: r.id,
              period: m,
              ...(r.card_id ? { card_id: r.card_id } : {}),
            }));
          if (due.length) {
            const ins = await db
              .from("transactions")
              .upsert(due, { onConflict: "recurring_id,period", ignoreDuplicates: true })
              .select(missing ? legacyTxColumns : txColumns);
            if (!ins.error) {
              txData = [...((ins.data ?? []) as unknown as Transaction[]).map(normalizeTx), ...txData].sort((a, b) =>
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
      } catch (e) {
        const reason = (e as { message?: string })?.message ?? "";
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
          if (isNetworkError({ message: reason })) toast("Sin conexión · mostrando datos guardados");
          else toast(`Error al actualizar: ${reason}`);
        } else {
          toast(isNetworkError({ message: reason }) ? "Sin conexión y sin datos guardados" : `No pude cargar: ${reason || "error desconocido"}`);
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

  // Cuando arranca la cuenta (00:00): ir al mes actual y generar los fijos que ya corresponden
  const wasPrelaunch = useRef(prelaunch);
  useEffect(() => {
    if (wasPrelaunch.current && !prelaunch) {
      const ym = currentMonth();
      if (ym !== monthRef.current) setMonth(ym);
      else load(ym);
    }
    wasPrelaunch.current = prelaunch;
  }, [prelaunch, load]);

  // Al volver a la app: refrescar datos (fijos que cayeron, otro dispositivo) y
  // saltar al mes nuevo si la dejaste abierta durante un cambio de mes.
  const monthRef = useRef(month);
  monthRef.current = month;
  const lastSeen = useRef({ at: Date.now(), ym: currentMonth() });
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const nowYm = currentMonth();
      const { at, ym } = lastSeen.current;
      lastSeen.current = { at: Date.now(), ym: nowYm };
      if (nowYm !== ym && monthRef.current === ym) setMonth(nowYm);
      else if (Date.now() - at > 60_000) load(monthRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // --- movimientos --------------------------------------------------------
  const addTx = useCallback(
    async (t: NewTx, shares: SplitShare[] = []) => {
      const others = shares.filter((x) => x.name.trim() && x.amount > 0);
      const othersTotal = others.reduce((a, x) => a + x.amount, 0);
      const row: Transaction = {
        id: uid(),
        kind: t.kind,
        amount: t.amount,
        category_id: t.category_id,
        note: t.note?.trim() || null,
        occurred_on: t.occurred_on,
        recurring_id: null,
        period: null,
        ...(others.length ? { my_share: Math.max(0, Math.round((t.amount - othersTotal) * 100) / 100) } : {}),
      };
      const insertOptimistic = (pending: boolean) =>
        setAllTxs((p) => [{ ...row, pending }, ...p].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)));
      insertOptimistic(false);
      const where = row.occurred_on.startsWith(monthRef.current) ? "" : ` · ${monthLabel(row.occurred_on.slice(0, 7))}`;
      const { error } = await supabase().from("transactions").insert(row);
      if (!error) {
        if (others.length) {
          const rows = others.map((x) => ({ id: uid(), transaction_id: row.id, purchase_id: null, name: x.name.trim(), amount: x.amount, settled_on: null }));
          const sp = await supabase().from("splits").insert(rows);
          if (sp.error) toast("Se guardó el gasto pero no la división: " + sp.error.message);
          else setSplits((p) => [...rows, ...p]);
        }
        toast(`${row.kind === "expense" ? "Gasto" : "Ingreso"} guardado ✓${where}`);
        return true;
      }
      if (others.length) {
        setAllTxs((p) => p.filter((x) => x.id !== row.id));
        toast(isNetworkError(error) ? "Sin conexión: los gastos divididos necesitan internet" : "No se pudo guardar: " + error.message);
        return false;
      }
      if (isNetworkError(error)) {
        setAllTxs((p) => p.map((x) => (x.id === row.id ? { ...x, pending: true } : x)));
        persistQueue([...readJSON<Transaction[]>(queueKey(userId), []), row]);
        toast("Guardado sin conexión · se sube solo al volver internet");
        return true;
      } else {
        setAllTxs((p) => p.filter((x) => x.id !== row.id));
        toast("No se pudo guardar: " + error.message);
        return false;
      }
    },
    [userId, persistQueue, toast],
  );

  const updateTx = useCallback(
    async (id: string, patch: Partial<NewTx>) => {
      const before = allTxs.find((t) => t.id === id);
      const full: Partial<Transaction> = { ...patch };
      if (before?.my_share != null && patch.amount !== undefined) {
        const othersTotal = splits.filter((x) => x.transaction_id === id).reduce((a, x) => a + x.amount, 0);
        full.my_share = Math.max(0, Math.round((patch.amount - othersTotal) * 100) / 100);
      }
      setAllTxs((p) => p.map((t) => (t.id === id ? { ...t, ...full } : t)));
      const { error } = await supabase().from("transactions").update(full).eq("id", id);
      if (error) {
        if (before) setAllTxs((p) => p.map((t) => (t.id === id ? before : t)));
        toast(isNetworkError(error) ? "Sin conexión: no se pudo editar" : error.message);
      }
    },
    [allTxs, splits, toast],
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
        day: r.card_id ? (cards.find((c) => c.id === r.card_id)?.due_day ?? r.day ?? 1) : (r.day ?? 1),
        active: r.active ?? true,
        ...(r.card_id !== undefined && !needsMigration ? { card_id: r.card_id } : {}),
      };
      const { error } = r.id
        ? await db.from("recurring").update(body).eq("id", r.id)
        : await db.from("recurring").insert(body);
      if (error) return toast(error.message);
      await load(month);
    },
    [cards, load, month, needsMigration, toast],
  );

  const deleteRecurring = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("recurring").delete().eq("id", id);
      if (error) return toast(error.message);
      await load(month);
    },
    [load, month, toast],
  );

  // --- tarjetas, compras y divisiones --------------------------------------
  const saveCard: Store["saveCard"] = useCallback(
    async (c) => {
      const db = supabase();
      const body = { name: c.name.trim(), color: c.color || "#7c5cff", due_day: c.due_day };
      if (c.id) {
        const before = cards.find((x) => x.id === c.id);
        const { error } = await db.from("cards").update(body).eq("id", c.id);
        if (error) return toast(error.message);
        // Si cambió el día de pago: mover suscripciones y cuotas futuras al nuevo día
        if (before && before.due_day !== c.due_day) {
          await db.from("recurring").update({ day: c.due_day }).eq("card_id", c.id);
          const { data } = await db
            .from("transactions")
            .select("id,occurred_on")
            .eq("card_id", c.id)
            .gte("occurred_on", monthStart(currentMonth()));
          await Promise.all(
            (data ?? []).map((t) =>
              db.from("transactions").update({ occurred_on: dueDate(t.occurred_on.slice(0, 7), c.due_day) }).eq("id", t.id),
            ),
          );
        }
      } else {
        const { error } = await db.from("cards").insert(body);
        if (error) return toast(error.message);
      }
      toast("Tarjeta guardada ✓");
      await load(month);
    },
    [cards, load, month, toast],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("cards").delete().eq("id", id);
      if (error) return toast(error.message);
      toast("Tarjeta borrada");
      await load(month);
    },
    [load, month, toast],
  );

  const savePurchase: Store["savePurchase"] = useCallback(
    async (input) => {
      const db = supabase();
      const card = cards.find((c) => c.id === input.card_id);
      if (!card) {
        toast("Elegí una tarjeta");
        return false;
      }
      const others = input.splits.filter((x) => x.name.trim() && x.amount > 0);
      const othersTotal = others.reduce((a, x) => a + x.amount, 0);
      const ratio = others.length ? Math.max(0, input.total_amount - othersTotal) / input.total_amount : null;
      const purchase: Purchase = {
        id: input.id ?? uid(),
        card_id: card.id,
        description: input.description.trim(),
        category_id: input.category_id,
        total_amount: input.total_amount,
        installments: input.installments,
        first_period: input.first_period,
        from_installment: Math.min(Math.max(1, input.from_installment), input.installments),
        purchased_on: input.purchased_on,
      };
      const res = input.id
        ? await db.from("purchases").update(purchase).eq("id", purchase.id)
        : await db.from("purchases").insert(purchase);
      if (res.error) {
        toast(isNetworkError(res.error) ? "Sin conexión: las compras con tarjeta necesitan internet" : res.error.message);
        return false;
      }
      // Cuotas: se regeneran completas (simple y sin inconsistencias)
      if (input.id) await db.from("transactions").delete().eq("purchase_id", purchase.id);
      const rows = buildInstallments(purchase, card, ratio);
      const ins = await db.from("transactions").insert(rows);
      if (ins.error) {
        toast("No se pudieron generar las cuotas: " + ins.error.message);
        return false;
      }
      // División: se reemplaza, conservando lo ya cobrado por nombre
      const prevSplits = splits.filter((x) => x.purchase_id === purchase.id);
      if (input.id) await db.from("splits").delete().eq("purchase_id", purchase.id);
      if (others.length) {
        const splitRows = others.map((x) => ({
          id: uid(),
          transaction_id: null,
          purchase_id: purchase.id,
          name: x.name.trim(),
          amount: x.amount,
          settled_on:
            x.settled_on ?? prevSplits.find((p) => p.name.toLowerCase() === x.name.trim().toLowerCase())?.settled_on ?? null,
        }));
        const sp = await db.from("splits").insert(splitRows);
        if (sp.error) toast("La compra se guardó, pero no la división: " + sp.error.message);
      }
      const n = rows.length;
      toast(
        input.id
          ? "Compra actualizada ✓"
          : purchase.installments > 1
            ? `Compra en ${purchase.installments} cuotas guardada ✓ (${n} por pagar)`
            : `Compra guardada ✓ · se paga el ${Number(rows[0]?.occurred_on.slice(8, 10))}/${Number(rows[0]?.occurred_on.slice(5, 7))}`,
      );
      await load(monthRef.current);
      return true;
    },
    [cards, splits, load, toast],
  );

  const deletePurchase = useCallback(
    async (id: string) => {
      // Las cuotas y la división se borran en cascada
      const { error } = await supabase().from("purchases").delete().eq("id", id);
      if (error) return toast(error.message);
      toast("Compra borrada");
      await load(monthRef.current);
    },
    [load, toast],
  );

  const settleSplit = useCallback(
    async (id: string, settled: boolean) => {
      const settled_on = settled ? todayISO() : null;
      setSplits((p) => p.map((x) => (x.id === id ? { ...x, settled_on } : x)));
      const { error } = await supabase().from("splits").update({ settled_on }).eq("id", id);
      if (error) {
        setSplits((p) => p.map((x) => (x.id === id ? { ...x, settled_on: settled ? null : todayISO() } : x)));
        toast(error.message);
      } else if (settled) toast("Marcado como cobrado ✓");
    },
    [toast],
  );

  const reload = useCallback(() => load(monthRef.current), [load]);

  // El alias vive en los metadatos del usuario de Supabase (sin tablas extra)
  const saveAlias = useCallback(
    async (value: string) => {
      const clean = value.trim();
      const { error } = await supabase().auth.updateUser({ data: { alias: clean } });
      if (error) return toast("No se pudo guardar el alias: " + error.message);
      setAlias(clean);
      toast(clean ? "Alias guardado ✓" : "Alias borrado");
    },
    [toast],
  );

  const saveDisplayName = useCallback(
    async (value: string) => {
      const clean = value.trim();
      const { error } = await supabase().auth.updateUser({ data: { name: clean } });
      if (error) return toast("No se pudo guardar tu nombre: " + error.message);
      setDisplayName(clean);
    },
    [toast],
  );

  const recentNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const x of splits) {
      const k = x.name.trim().toLowerCase();
      if (!seen.has(k)) seen.set(k, x.name.trim());
    }
    return [...seen.values()].slice(0, 10);
  }, [splits]);

  const saveCategory: Store["saveCategory"] = useCallback(
    async (c) => {
      const db = supabase();
      const body = {
        kind: c.kind,
        name: c.name.trim(),
        emoji: c.emoji || "🏷️",
        color: c.color || "#8b5cf6",
      };
      const id = c.id ?? uid();
      const { error } = c.id
        ? await db.from("categories").update(body).eq("id", id)
        : await db.from("categories").insert({ id, ...body, sort: categories.length });
      if (error) {
        toast(error.message);
        return null;
      }
      // Actualización local (sin recargar todo): la carga en curso no se interrumpe
      setCategories((prev) =>
        c.id ? prev.map((x) => (x.id === id ? { ...x, ...body } : x)) : [...prev, { id, ...body, sort: prev.length }],
      );
      toast(c.id ? "Categoría actualizada ✓" : `Categoría “${body.name}” creada ✓`);
      return id;
    },
    [categories.length, toast],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("categories").delete().eq("id", id);
      if (error) return toast(error.message);
      setCategories((prev) => prev.filter((x) => x.id !== id));
      // Los movimientos de esa categoría pasan a "Sin categoría" en la base: refrescamos
      await load(month);
    },
    [load, month, toast],
  );

  const signOut = useCallback(async () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("gastos.snap."))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignorar */
    }
    await supabase().auth.signOut();
  }, []);

  const prev = addMonths(month, -1);
  const txs = useMemo(() => allTxs.filter((t) => t.occurred_on.startsWith(month)), [allTxs, month]);
  const prevTxs = useMemo(() => allTxs.filter((t) => t.occurred_on.startsWith(prev)), [allTxs, prev]);

  const value: Store = {
    userId,
    email,
    alias,
    saveAlias,
    displayName,
    saveDisplayName,
    recentNames,
    loading,
    month,
    setMonth,
    categories,
    recurring,
    txs,
    prevTxs,
    pendingCount: queue.length,
    cards,
    purchases,
    splits,
    needsMigration,
    addTx,
    updateTx,
    deleteTx,
    saveRecurring,
    deleteRecurring,
    saveCard,
    deleteCard,
    savePurchase,
    deletePurchase,
    settleSplit,
    saveCategory,
    deleteCategory,
    signOut,
    toast,
    toastMsg,
    sheet,
    openSheet,
    closeSheet,
    purchaseSheet,
    openPurchase,
    closePurchase,
    reload,
    hideAmounts,
    toggleHideAmounts,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
