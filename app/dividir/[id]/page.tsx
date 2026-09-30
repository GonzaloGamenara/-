"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useShared } from "@/lib/sharedStore";
import { groupBalances, type SharedExpense, type SharedMember } from "@/lib/shared";
import { dayLabel, money } from "@/lib/format";
import { debtMessage, shareText } from "@/lib/share";
import { Sheet } from "@/components/Sheet";
import { PeopleInput } from "@/components/PeopleInput";
import { CategoryChips } from "@/components/CategoryChips";
import { SharedExpenseSheet } from "@/components/SharedExpenseSheet";
import { ChevronLeft, PlusIcon, XIcon } from "@/components/Icons";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { alias, categories } = useStore();
  const { groups, members, expenses, payments, ready, addPayment, deletePayment, addMember, removeMember, updateGroup, deleteGroup } = useShared();
  const [expenseSheet, setExpenseSheet] = useState<{ initial: SharedExpense | null } | null>(null);
  const [addingPeople, setAddingPeople] = useState(false);
  const [editing, setEditing] = useState(false);

  const g = groups.find((x) => x.id === id);
  const ms = useMemo(() => members.filter((m) => m.group_id === id), [members, id]);
  const es = useMemo(() => expenses.filter((e) => e.group_id === id), [expenses, id]);
  const ps = useMemo(() => payments.filter((p) => p.group_id === id), [payments, id]);
  const b = useMemo(() => groupBalances(ms, es, ps), [ms, es, ps]);

  if (!g) {
    return (
      <div className="grid gap-4 pt-2">
        <Back />
        <p className="text-muted">{ready ? "No encontré esta cuenta." : "Cargando…"}</p>
      </div>
    );
  }

  const me = ms.find((m) => m.is_me);
  const name = (mid: string) => {
    const m = ms.find((x) => x.id === mid);
    return m?.is_me ? "Vos" : (m?.name ?? "?");
  };
  const myNet = me ? (b.net.get(me.id) ?? 0) : 0;
  const cat = categories.find((c) => c.id === g.category_id);

  return (
    <div className="grid gap-5">
      <Back />

      <header className="rise flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{g.name}</h1>
          <p className="text-sm capitalize text-muted">
            {dayLabel(g.occurred_on)}
            {cat && ` · ${cat.emoji} ${cat.name}`}
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="press shrink-0 rounded-full bg-surface px-3.5 py-2 text-sm font-medium">
          Editar
        </button>
      </header>

      {/* Resumen */}
      <section className="glass rise rounded-[28px] p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Total gastado</p>
            <p className="num text-3xl font-semibold">{money(b.total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Tu parte</p>
            <p className="num text-lg font-semibold">{money(me ? (b.consumed.get(me.id) ?? 0) : 0)}</p>
          </div>
        </div>
        <p
          className={`mt-4 rounded-2xl px-3.5 py-2.5 text-center text-sm font-semibold ${
            b.total === 0 ? "bg-inset text-muted" : myNet > 0.5 ? "bg-inc/15 text-inc" : myNet < -0.5 ? "bg-exp/15 text-exp" : "bg-inset"
          }`}
        >
          {b.total === 0
            ? "Cargá lo que pagó cada uno"
            : myNet > 0.5
              ? `Te deben ${money(myNet)}`
              : myNet < -0.5
                ? `Debés ${money(-myNet)}`
                : b.transfers.length
                  ? "Vos estás al día"
                  : "Todo saldado ✓"}
        </p>
      </section>

      {/* Personas */}
      <section className="rise">
        <div className="hide-scroll -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
          {ms.map((m) => (
            <span key={m.id} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface py-1.5 pl-1.5 pr-3 text-sm">
              <span className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${m.is_me ? "bg-accent2/30" : "bg-inset"}`}>
                {m.is_me ? "Yo" : m.name[0]?.toUpperCase()}
              </span>
              {m.is_me ? "Vos" : m.name}
              {!m.is_me && !es.some((e) => e.payer_id === m.id) && (
                <button
                  onClick={() => confirm(`¿Sacar a ${m.name} de la cuenta?`) && removeMember(m.id)}
                  aria-label={`Sacar a ${m.name}`}
                  className="-mr-1 grid size-5 place-items-center rounded-full text-muted"
                >
                  <XIcon width={12} height={12} />
                </button>
              )}
            </span>
          ))}
          <button onClick={() => setAddingPeople(true)} className="press flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-muted">
            <PlusIcon width={14} height={14} /> Persona
          </button>
        </div>
      </section>

      {/* Gastos */}
      <section className="rise">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Quién pagó qué</h2>
        </div>
        {es.length > 0 && (
          <ul className="glass mb-2 divide-y divide-line overflow-hidden rounded-3xl">
            {es.map((e) => {
              const partial = e.among && e.among.length < ms.length;
              return (
                <li key={e.id}>
                  <button onClick={() => setExpenseSheet({ initial: e })} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-inset text-sm font-bold">{name(e.payer_id)[0]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {e.payer_id === me?.id ? "Pagaste" : `${name(e.payer_id)} pagó`}
                        {e.description ? ` · ${e.description}` : ""}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {partial ? `entre ${e.among!.map(name).join(", ")}` : "entre todos"}
                      </span>
                    </span>
                    <span className="num font-semibold">{money(e.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          onClick={() => setExpenseSheet({ initial: null })}
          className="press flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line py-4 font-semibold text-accent2"
        >
          <PlusIcon width={18} height={18} /> Agregar lo que pagó alguien
        </button>
      </section>

      {/* Cómo saldar */}
      {b.transfers.length > 0 && (
        <section className="rise">
          <h2 className="mb-2 px-1 text-sm font-semibold">Para quedar a mano</h2>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {b.transfers.map((t) => {
              const toMe = t.to === me?.id;
              const fromMe = t.from === me?.id;
              return (
                <li key={`${t.from}-${t.to}`} className="flex items-center gap-2 px-4 py-3">
                  <span className="min-w-0 flex-1 text-sm">
                    <b>{name(t.from)}</b> {fromMe ? "le debés" : "le debe"} a <b>{toMe ? "vos" : name(t.to)}</b>
                    <span className="num block text-base font-semibold">{money(t.amount)}</span>
                  </span>
                  {toMe && (
                    <button
                      onClick={() => shareText(debtMessage(name(t.from), [{ label: g.name, amount: t.amount }], alias))}
                      className="press rounded-full bg-[#25D366] px-3.5 py-2 text-xs font-semibold text-black"
                    >
                      Pedir
                    </button>
                  )}
                  <button
                    onClick={() => addPayment({ group_id: g.id, from_id: t.from, to_id: t.to, amount: t.amount })}
                    className="press rounded-full border border-line px-3.5 py-2 text-xs font-semibold"
                  >
                    {toMe ? "Me pagó" : fromMe ? "Ya pagué" : "Pagado"}
                  </button>
                </li>
              );
            })}
          </ul>
          {!alias && <p className="mt-2 px-1 text-xs text-muted">Tip: cargá tu alias en Perfil para que vaya en el mensaje.</p>}
        </section>
      )}

      {/* Detalle por persona */}
      {es.length > 0 && (
        <section className="rise">
          <h2 className="mb-2 px-1 text-sm font-semibold">Detalle por persona</h2>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl text-sm">
            {ms.map((m: SharedMember) => (
              <li key={m.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5">
                <span className="truncate font-medium">{m.is_me ? "Vos" : m.name}</span>
                <span className="num text-right text-xs text-muted">
                  pagó {money(b.paid.get(m.id) ?? 0)}
                  <br />
                  le toca {money(b.consumed.get(m.id) ?? 0)}
                </span>
                <span className={`num w-24 text-right font-semibold ${(b.net.get(m.id) ?? 0) > 0.5 ? "text-inc" : (b.net.get(m.id) ?? 0) < -0.5 ? "text-exp" : "text-muted"}`}>
                  {(b.net.get(m.id) ?? 0) > 0.5 ? "+" : ""}
                  {money(b.net.get(m.id) ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ps.length > 0 && (
        <section className="rise">
          <h2 className="mb-2 px-1 text-sm font-semibold">Pagos anotados</h2>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl text-sm">
            {ps.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="flex-1">
                  {name(p.from_id)} → {name(p.to_id)} <span className="num font-semibold">{money(p.amount)}</span>
                </span>
                <button onClick={() => deletePayment(p.id)} className="text-xs text-muted underline">
                  Deshacer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {expenseSheet && <SharedExpenseSheet groupId={g.id} members={ms} initial={expenseSheet.initial} onClose={() => setExpenseSheet(null)} />}

      {addingPeople && (
        <AddPeopleSheet
          existing={ms.map((m) => m.name.toLowerCase())}
          onClose={() => setAddingPeople(false)}
          onAdd={async (names) => {
            for (const n of names) await addMember(g.id, n);
            setAddingPeople(false);
          }}
        />
      )}

      {editing && (
        <EditGroupSheet
          name={g.name}
          categoryId={g.category_id}
          date={g.occurred_on}
          onClose={() => setEditing(false)}
          onSave={async (patch) => {
            await updateGroup(g.id, patch);
            setEditing(false);
          }}
          onDelete={async () => {
            if (confirm("¿Borrar la cuenta completa? También se borra tu parte de tus movimientos.")) {
              await deleteGroup(g.id);
              router.push("/dividir");
            }
          }}
        />
      )}
    </div>
  );
}

function Back() {
  return (
    <Link href="/dividir" className="press rise -ml-1 flex w-fit items-center gap-1 pt-1 text-sm text-muted">
      <span className="grid size-9 place-items-center rounded-full bg-surface">
        <ChevronLeft width={18} height={18} />
      </span>
      Dividir
    </Link>
  );
}

function AddPeopleSheet({ existing, onClose, onAdd }: { existing: string[]; onClose: () => void; onAdd: (names: string[]) => Promise<void> }) {
  const { recentNames } = useStore();
  const [people, setPeople] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Sumar personas">
      <div className="grid gap-4">
        <PeopleInput value={people} onChange={setPeople} suggestions={recentNames.filter((n) => !existing.includes(n.toLowerCase()))} />
        <button
          disabled={!people.length || busy}
          onClick={async () => {
            setBusy(true);
            await onAdd(people.filter((p) => !existing.includes(p.toLowerCase())));
            setBusy(false);
          }}
          className="press rounded-2xl bg-accent2 py-3.5 font-semibold text-black disabled:opacity-35"
        >
          Sumar
        </button>
      </div>
    </Sheet>
  );
}

function EditGroupSheet({
  name,
  categoryId,
  date,
  onClose,
  onSave,
  onDelete,
}: {
  name: string;
  categoryId: string | null;
  date: string;
  onClose: () => void;
  onSave: (p: { name: string; category_id: string | null; occurred_on: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [n, setN] = useState(name);
  const [c, setC] = useState(categoryId);
  const [d, setD] = useState(date);
  return (
    <Sheet open onClose={onClose} title="Editar cuenta">
      <div className="grid gap-4">
        <input value={n} onChange={(e) => setN(e.target.value)} maxLength={50} className="w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg focus:border-accent2" />
        <CategoryChips kind="expense" value={c} onChange={setC} />
        <label className="flex items-center justify-between gap-3 text-sm text-muted">
          Fecha
          <input type="date" value={d} onChange={(e) => e.target.value && setD(e.target.value)} className="w-40 rounded-xl border border-line bg-inset px-3 py-2 text-fg" />
        </label>
        <div className="flex gap-2">
          <button onClick={onDelete} className="press rounded-2xl bg-inset px-4 font-semibold text-exp">
            Borrar
          </button>
          <button disabled={!n.trim()} onClick={() => onSave({ name: n.trim(), category_id: c, occurred_on: d })} className="press flex-1 rounded-2xl bg-fg py-3.5 font-semibold text-bg disabled:opacity-35">
            Guardar
          </button>
        </div>
      </div>
    </Sheet>
  );
}
