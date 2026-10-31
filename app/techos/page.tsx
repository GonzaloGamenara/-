"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useTechos, type BudgetInput } from "@/lib/techosStore";
import { daysLabel, type Budget, type BudgetStatus } from "@/lib/techos";
import { currentMonth, dayLabel, daysInMonth, money, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PlanTabs } from "@/components/PlanTabs";
import { EyeToggle } from "@/components/EyeToggle";
import { BudgetBar, useBudgetStatuses } from "@/components/Techos";
import { BudgetForm } from "@/components/BudgetForm";
import { Sheet } from "@/components/Sheet";
import { PlusIcon } from "@/components/Icons";

/** Techos sugeridos: se arman con las categorías que existan con estos nombres */
const SUGERIDOS: { name: string; cats: string[]; monthly: number; weekly?: number; max?: number; days?: number[] }[] = [
  { name: "Supermercado", cats: ["Supermercado"], monthly: 120000 },
  { name: "Comida afuera", cats: ["Comida afuera"], monthly: 20000 },
  { name: "Delivery", cats: ["Delivery"], monthly: 80000, weekly: 20000, max: 20000, days: [6] },
  { name: "Antojos", cats: ["Café y antojos", "Kiosco"], monthly: 30000 },
  { name: "Transporte", cats: ["Transporte"], monthly: 35000 },
  { name: "Gustos", cats: ["Libros", "Videojuegos", "Salidas", "Ropa"], monthly: 50000 },
  { name: "Imprevistos", cats: ["Otros", "Hogar", "Regalos"], monthly: 40000 },
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function rules(b: Pick<Budget, "weekly" | "max_per_tx" | "allowed_days">) {
  const out: string[] = [];
  if (b.weekly) out.push(`${money(b.weekly)} por semana`);
  if (b.max_per_tx) out.push(`máx ${money(b.max_per_tx)} por movimiento`);
  if (b.allowed_days?.length) out.push(`solo ${daysLabel(b.allowed_days)}`);
  return out.join(" · ");
}

export default function Techos() {
  const { categories } = useStore();
  const { ready, missing, budgets } = useTechos();
  const month = currentMonth();
  const statuses = useBudgetStatuses(month);
  const [editing, setEditing] = useState<Partial<Budget> | null>(null);
  const [suggest, setSuggest] = useState(false);

  const byId = useMemo(() => new Map((statuses ?? []).map((s) => [s.cfg.id, s])), [statuses]);
  const free = categories.filter((c) => c.kind === "expense" && !budgets.some((b) => b.category_ids.includes(c.id)));
  const total = budgets.reduce((a, b) => a + b.monthly, 0);
  const day = Number(todayISO().slice(8, 10));
  const expected = day / daysInMonth(month);

  return (
    <div className="grid gap-4">
      <PageHeader title="Plan" subtitle="Cuánto querés gastar por mes" right={<EyeToggle />} />
      <PlanTabs />

      {missing ? (
        <div className="glass rounded-3xl border-l-4 border-l-exp p-4 text-sm">
          <b>Falta un paso en Supabase.</b>
          <p className="mt-1 text-muted">
            Corré el archivo <code className="text-fg">supabase/migrations/006_techos.sql</code> en Supabase → SQL Editor → Run, y recargá la app.
          </p>
        </div>
      ) : !ready ? (
        <div className="skeleton h-64" />
      ) : !budgets.length ? (
        <section className="glass rise grid gap-3 rounded-3xl p-6 text-center">
          <span className="text-4xl">🎯</span>
          <h2 className="text-lg font-semibold">Un techo por categoría</h2>
          <p className="text-sm text-muted">
            Cuando cargues un gasto vas a ver cuánto te queda, y la app te avisa si te acercás o te pasás. No bloquea nada: solo te pide confirmar.
          </p>
          <button onClick={() => setSuggest(true)} className="press mt-2 rounded-2xl bg-fg py-3.5 font-semibold text-bg">
            Cargar techos sugeridos
          </button>
          <button onClick={() => setEditing({})} className="text-sm text-muted underline underline-offset-4">
            o crear uno desde cero
          </button>
        </section>
      ) : (
        <>
          <p className="px-1 text-sm text-muted">
            Techo total: <b className="num text-fg">{money(total)}</b> por mes. Cuenta tu parte de cada gasto; las compras con tarjeta, en la fecha
            de compra (en cuotas, una cuota por mes).
          </p>
          <ul className="grid gap-3">
            {budgets.map((b) => {
              const s = byId.get(b.id);
              return (
                <li key={b.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditing(b)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setEditing(b))}
                    className="glass press rise grid w-full cursor-pointer gap-2 rounded-3xl p-4 text-left"
                  >
                    {s ? <BudgetBar s={s} expectedPct={expected} /> : <div className="skeleton h-10" />}
                    {rules(b) && <p className="text-xs text-muted">{rules(b)}</p>}
                    {s && s.excesses.length > 0 && <Excesses s={s} />}
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            onClick={() => setEditing({})}
            className="press flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3.5 text-sm font-semibold text-muted"
          >
            <PlusIcon width={16} height={16} /> Agregar techo
          </button>
          {free.length > 0 && (
            <p className="px-1 text-xs text-muted">
              Sin techo: {free.map((c) => `${c.emoji} ${c.name}`).join(" · ")}
            </p>
          )}
        </>
      )}

      {editing && <BudgetForm initial={editing} onClose={() => setEditing(null)} />}
      {suggest && <SuggestSheet onClose={() => setSuggest(false)} />}
    </div>
  );
}

function Excesses({ s }: { s: BudgetStatus }) {
  return (
    <ul className="grid gap-2 rounded-2xl bg-exp/10 px-3 py-2 text-xs">
      {s.excesses.map((e, i) => (
        <li key={i} className="grid gap-0.5">
          <span className="flex min-w-0 gap-2">
            <span className="shrink-0 text-muted">{dayLabel(e.date)}</span>
            <span className="min-w-0 flex-1 truncate">{e.label || "Gasto"}</span>
            <span className="num shrink-0 font-semibold">{money(e.amount)}</span>
          </span>
          <span className="text-exp">{e.reasons.join(" · ")}</span>
        </li>
      ))}
    </ul>
  );
}

/** Vista previa de los techos sugeridos con tus categorías */
function SuggestSheet({ onClose }: { onClose: () => void }) {
  const { categories } = useStore();
  const { saveMany } = useTechos();
  const [busy, setBusy] = useState(false);
  const expense = categories.filter((c) => c.kind === "expense");

  const plan = SUGERIDOS.map((s) => {
    const found = s.cats.map((n) => expense.find((c) => norm(c.name) === norm(n))).filter((c): c is NonNullable<typeof c> => !!c);
    const missingCats = s.cats.filter((n) => !expense.some((c) => norm(c.name) === norm(n)));
    return { ...s, found, missingCats };
  }).filter((p) => p.found.length);
  const total = plan.reduce((a, p) => a + p.monthly, 0);

  return (
    <Sheet open onClose={onClose} title="Techos sugeridos">
      <div className="grid gap-4">
        <ul className="grid gap-2">
          {plan.map((p) => (
            <li key={p.name} className="rounded-2xl bg-inset px-3.5 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="num font-semibold">{money(p.monthly)}</span>
              </div>
              <p className="text-xs text-muted">
                {p.found.map((c) => `${c.emoji} ${c.name}`).join(" · ")}
                {p.missingCats.length > 0 && ` (no tenés: ${p.missingCats.join(", ")})`}
              </p>
              {rules({ weekly: p.weekly ?? null, max_per_tx: p.max ?? null, allowed_days: p.days ?? null }) && (
                <p className="text-xs text-muted">{rules({ weekly: p.weekly ?? null, max_per_tx: p.max ?? null, allowed_days: p.days ?? null })}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Total: <b className="num text-fg">{money(total)}</b> por mes. Después podés editar cada uno.
        </p>
        <button
          disabled={busy || !plan.length}
          onClick={async () => {
            setBusy(true);
            const list: BudgetInput[] = plan.map((p) => ({
              name: p.name,
              category_ids: p.found.map((c) => c.id),
              monthly: p.monthly,
              weekly: p.weekly ?? null,
              max_per_tx: p.max ?? null,
              allowed_days: p.days ?? null,
            }));
            if (await saveMany(list)) onClose();
            else setBusy(false);
          }}
          className="press rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? "Creando…" : `Crear ${plan.length} techos`}
        </button>
      </div>
    </Sheet>
  );
}
