"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isConfigured, supabase } from "@/lib/supabase";
import { groupBalances, type SharedExpense, type SharedMember, type SharedPayment } from "@/lib/shared";
import { dayLabel, money } from "@/lib/format";
import { copyText } from "@/lib/share";

interface PublicGroup {
  name: string;
  occurred_on: string;
  owner_name: string | null;
  alias: string | null;
  members: Omit<SharedMember, "group_id">[];
  expenses: Omit<SharedExpense, "group_id">[];
  payments: Omit<SharedPayment, "group_id">[];
}

/** Vista pública (solo lectura) de una cuenta compartida: la ve cualquiera con el link. */
export default function PublicGroupPage() {
  const { token } = useParams<{ token: string }>();
  const [g, setG] = useState<PublicGroup | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isConfigured) return setG(null);
    supabase()
      .rpc("shared_group_public", { p_token: token })
      .then(({ data, error }) => setG(error || !data ? null : (data as PublicGroup)));
  }, [token]);

  const b = useMemo(() => {
    if (!g) return null;
    const ms = g.members.map((m) => ({ ...m, group_id: "" }));
    return groupBalances(
      ms,
      g.expenses.map((e) => ({ ...e, group_id: "", amount: Number(e.amount) })),
      g.payments.map((p) => ({ ...p, group_id: "", amount: Number(p.amount) })),
    );
  }, [g]);

  if (g === undefined) return <main className="grid min-h-dvh place-items-center text-muted">Cargando…</main>;
  if (!g || !b) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-3 px-6 text-center">
        <div className="text-4xl">🔗</div>
        <h1 className="text-xl font-semibold">Este link no existe o dejó de compartirse</h1>
        <p className="text-sm text-muted">Pedile a quien te lo pasó que te mande uno nuevo.</p>
      </main>
    );
  }

  const owner = g.owner_name?.trim() || "Quien armó la cuenta";
  const name = (id: string) => {
    const m = g.members.find((x) => x.id === id);
    return m?.is_me ? owner : (m?.name ?? "?");
  };
  const ownerId = g.members.find((m) => m.is_me)?.id;

  return (
    <main className="mx-auto grid w-full max-w-xl gap-5 px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="rise">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Cuenta compartida</p>
        <h1 className="text-3xl font-semibold tracking-tight">{g.name}</h1>
        <p className="text-sm capitalize text-muted">
          {dayLabel(g.occurred_on)} · {g.members.map((m) => (m.is_me ? owner : m.name)).join(", ")}
        </p>
      </header>

      <section className="glass rise rounded-[28px] p-5">
        <p className="text-xs text-muted">Total gastado</p>
        <p className="num text-3xl font-semibold">{money(b.total)}</p>
        <p className="mt-1 text-sm text-muted">
          {money(b.total / Math.max(g.members.length, 1))} por persona si se reparte todo entre todos
        </p>
      </section>

      <section className="rise">
        <h2 className="mb-2 px-1 text-sm font-semibold">Para quedar a mano</h2>
        {b.transfers.length ? (
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {b.transfers.map((t) => (
              <li key={`${t.from}-${t.to}`} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <span className="text-sm">
                  <b>{name(t.from)}</b> le pasa a <b>{name(t.to)}</b>
                </span>
                <span className="num font-semibold">{money(t.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="glass rounded-3xl p-4 text-center text-sm">Todo saldado ✓</p>
        )}
      </section>

      {g.alias && b.transfers.some((t) => t.to === ownerId) && (
        <section className="glass rise flex items-center gap-3 rounded-3xl p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted">Alias de {owner}</span>
            <span className="block truncate text-lg font-semibold">{g.alias}</span>
          </span>
          <button
            onClick={async () => setCopied(await copyText(g.alias!))}
            className="press rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg"
          >
            {copied ? "Copiado ✓" : "Copiar"}
          </button>
        </section>
      )}

      <section className="rise">
        <h2 className="mb-2 px-1 text-sm font-semibold">Quién pagó qué</h2>
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {g.expenses.map((e) => {
            const partial = e.among && e.among.length && e.among.length < g.members.length;
            return (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {name(e.payer_id)} pagó{e.description ? ` · ${e.description}` : ""}
                  </span>
                  <span className="block truncate text-xs text-muted">{partial ? `entre ${e.among!.map(name).join(", ")}` : "entre todos"}</span>
                </span>
                <span className="num font-semibold">{money(Number(e.amount))}</span>
              </li>
            );
          })}
          {!g.expenses.length && <li className="px-4 py-3 text-sm text-muted">Todavía no hay gastos cargados.</li>}
        </ul>
      </section>

      <section className="rise">
        <h2 className="mb-2 px-1 text-sm font-semibold">Por persona</h2>
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl text-sm">
          {g.members.map((m) => {
            const net = b.net.get(m.id) ?? 0;
            return (
              <li key={m.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5">
                <span className="truncate font-medium">{m.is_me ? owner : m.name}</span>
                <span className="num text-right text-xs text-muted">
                  pagó {money(b.paid.get(m.id) ?? 0)}
                  <br />
                  le toca {money(b.consumed.get(m.id) ?? 0)}
                </span>
                <span className={`num w-24 text-right font-semibold ${net > 0.5 ? "text-inc" : net < -0.5 ? "text-exp" : "text-muted"}`}>
                  {net > 0.5 ? "+" : ""}
                  {money(net)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-center text-xs text-muted">Solo lectura · se actualiza cuando {owner} carga cambios</p>
    </main>
  );
}
