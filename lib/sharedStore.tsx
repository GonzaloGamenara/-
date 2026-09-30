"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { useStore } from "./store";
import { uid, todayISO } from "./format";
import { groupBalances, type SharedExpense, type SharedGroup, type SharedMember, type SharedPayment } from "./shared";

interface SharedStore {
  ready: boolean;
  /** Falta correr la migración 003 */
  missing: boolean;
  groups: SharedGroup[];
  members: SharedMember[];
  expenses: SharedExpense[];
  payments: SharedPayment[];
  /** Neto tuyo sumando todas las cuentas: + te deben, − debés */
  myNet: number;
  createGroup: (g: { name: string; category_id: string | null; occurred_on: string; people: string[] }) => Promise<string | null>;
  updateGroup: (id: string, patch: Partial<Pick<SharedGroup, "name" | "category_id" | "occurred_on">>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  addMember: (groupId: string, name: string) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  saveExpense: (e: Omit<SharedExpense, "id"> & { id?: string }) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<void>;
  addPayment: (p: Omit<SharedPayment, "id" | "paid_on">) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
}

const Ctx = createContext<SharedStore | null>(null);
export const useShared = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useShared fuera de SharedProvider");
  return s;
};

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find/i.test(e.message ?? ""));

export function SharedProvider({ children }: { children: ReactNode }) {
  const { toast, reload } = useStore();
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [groups, setGroups] = useState<SharedGroup[]>([]);
  const [members, setMembers] = useState<SharedMember[]>([]);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [payments, setPayments] = useState<SharedPayment[]>([]);

  /** Trae todo (son pocas filas) y devuelve la foto para poder sincronizar al toque. */
  const fetchAll = useCallback(async () => {
    const db = supabase();
    const [g, m, e, p] = await Promise.all([
      db.from("shared_groups").select("id,name,category_id,occurred_on,transaction_id").order("occurred_on", { ascending: false }),
      db.from("shared_members").select("id,group_id,name,is_me").order("created_at"),
      db.from("shared_expenses").select("id,group_id,payer_id,amount,description,among").order("created_at"),
      db.from("shared_payments").select("id,group_id,from_id,to_id,amount,paid_on").order("created_at"),
    ]);
    if (isMissing(g.error)) {
      setMissing(true);
      setReady(true);
      return null;
    }
    const arr = <T,>(d: unknown) => (Array.isArray(d) ? (d as T[]) : []);
    const snap = {
      groups: arr<SharedGroup>(g.data),
      members: arr<SharedMember>(m.data),
      expenses: arr<SharedExpense>(e.data).map((x) => ({ ...x, amount: Number(x.amount) })),
      payments: arr<SharedPayment>(p.data).map((x) => ({ ...x, amount: Number(x.amount) })),
    };
    setMissing(false);
    setGroups(snap.groups);
    setMembers(snap.members);
    setExpenses(snap.expenses);
    setPayments(snap.payments);
    setReady(true);
    return snap;
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Tu parte consumida en la cuenta = un movimiento tuyo (crea, actualiza o borra). */
  const syncMyShare = useCallback(
    async (groupId: string) => {
      const snap = await fetchAll();
      if (!snap) return;
      const g = snap.groups.find((x) => x.id === groupId);
      if (!g) return;
      const ms = snap.members.filter((m) => m.group_id === groupId);
      const me = ms.find((m) => m.is_me);
      if (!me) return;
      const { consumed } = groupBalances(
        ms,
        snap.expenses.filter((e) => e.group_id === groupId),
        [],
      );
      const mine = Math.round((consumed.get(me.id) ?? 0) * 100) / 100;
      const db = supabase();
      const body = {
        kind: "expense" as const,
        amount: mine,
        category_id: g.category_id,
        note: `${g.name} (tu parte)`,
        occurred_on: g.occurred_on,
      };
      if (g.transaction_id) {
        if (mine > 0) await db.from("transactions").update(body).eq("id", g.transaction_id);
        else {
          await db.from("transactions").delete().eq("id", g.transaction_id);
          await db.from("shared_groups").update({ transaction_id: null }).eq("id", g.id);
        }
      } else if (mine > 0) {
        const id = uid();
        const ins = await db.from("transactions").insert({ id, ...body, recurring_id: null, period: null });
        if (!ins.error) await db.from("shared_groups").update({ transaction_id: id }).eq("id", g.id);
      }
      await fetchAll();
      await reload();
    },
    [fetchAll, reload],
  );

  const createGroup: SharedStore["createGroup"] = useCallback(
    async ({ name, category_id, occurred_on, people }) => {
      const db = supabase();
      const id = uid();
      const res = await db.from("shared_groups").insert({ id, name: name.trim(), category_id, occurred_on });
      if (res.error) {
        toast(res.error.message);
        return null;
      }
      const rows = [
        { id: uid(), group_id: id, name: "Vos", is_me: true },
        ...people.map((n) => ({ id: uid(), group_id: id, name: n.trim(), is_me: false })),
      ];
      const mr = await db.from("shared_members").insert(rows);
      if (mr.error) toast(mr.error.message);
      await fetchAll();
      return id;
    },
    [fetchAll, toast],
  );

  const updateGroup: SharedStore["updateGroup"] = useCallback(
    async (id, patch) => {
      const { error } = await supabase().from("shared_groups").update(patch).eq("id", id);
      if (error) return toast(error.message);
      await syncMyShare(id);
    },
    [syncMyShare, toast],
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      const g = groups.find((x) => x.id === id);
      const db = supabase();
      const { error } = await db.from("shared_groups").delete().eq("id", id);
      if (error) return toast(error.message);
      if (g?.transaction_id) await db.from("transactions").delete().eq("id", g.transaction_id);
      toast("Cuenta borrada");
      await fetchAll();
      await reload();
    },
    [groups, fetchAll, reload, toast],
  );

  const addMember = useCallback(
    async (groupId: string, name: string) => {
      const { error } = await supabase().from("shared_members").insert({ id: uid(), group_id: groupId, name: name.trim(), is_me: false });
      if (error) return toast(error.message);
      await syncMyShare(groupId);
    },
    [syncMyShare, toast],
  );

  const removeMember = useCallback(
    async (id: string) => {
      const m = members.find((x) => x.id === id);
      const { error } = await supabase().from("shared_members").delete().eq("id", id);
      if (error) return toast(error.message);
      if (m) await syncMyShare(m.group_id);
    },
    [members, syncMyShare, toast],
  );

  const saveExpense: SharedStore["saveExpense"] = useCallback(
    async (e) => {
      const db = supabase();
      const body = {
        group_id: e.group_id,
        payer_id: e.payer_id,
        amount: e.amount,
        description: e.description?.trim() || null,
        among: e.among && e.among.length ? e.among : null,
      };
      const { error } = e.id
        ? await db.from("shared_expenses").update(body).eq("id", e.id)
        : await db.from("shared_expenses").insert({ id: uid(), ...body });
      if (error) {
        toast(error.message);
        return false;
      }
      await syncMyShare(e.group_id);
      return true;
    },
    [syncMyShare, toast],
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      const e = expenses.find((x) => x.id === id);
      const { error } = await supabase().from("shared_expenses").delete().eq("id", id);
      if (error) return toast(error.message);
      if (e) await syncMyShare(e.group_id);
    },
    [expenses, syncMyShare, toast],
  );

  const addPayment: SharedStore["addPayment"] = useCallback(
    async (p) => {
      const { error } = await supabase().from("shared_payments").insert({ id: uid(), ...p, paid_on: todayISO() });
      if (error) return toast(error.message);
      toast("Anotado ✓");
      await fetchAll();
    },
    [fetchAll, toast],
  );

  const deletePayment = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("shared_payments").delete().eq("id", id);
      if (error) return toast(error.message);
      await fetchAll();
    },
    [fetchAll, toast],
  );

  // Tu saldo total sumando todas las cuentas
  const myNet = useMemo(() => {
    let total = 0;
    for (const g of groups) {
      const ms = members.filter((m) => m.group_id === g.id);
      const me = ms.find((m) => m.is_me);
      if (!me) continue;
      const { net } = groupBalances(
        ms,
        expenses.filter((e) => e.group_id === g.id),
        payments.filter((p) => p.group_id === g.id),
      );
      total += net.get(me.id) ?? 0;
    }
    return Math.round(total * 100) / 100;
  }, [groups, members, expenses, payments]);

  const value: SharedStore = {
    ready,
    missing,
    groups,
    members,
    expenses,
    payments,
    myNet,
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
    saveExpense,
    deleteExpense,
    addPayment,
    deletePayment,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
