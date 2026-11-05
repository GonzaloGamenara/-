"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useBudgetItems, useTechos } from "@/lib/techosStore";
import { budgetStatus, checkExpense, pendingFijos, type BudgetStatus, type Check } from "@/lib/techos";
import { currentMonth, daysInMonth, money, moneyRound, monthLabel, todayISO } from "@/lib/format";
import { ChevronRight } from "./Icons";

const TONE = { ok: "var(--inc)", warn: "#f59e0b", over: "var(--exp)" } as const;

/** Estado de todos los techos de un mes, de mayor a menor % usado */
export function useBudgetStatuses(month: string) {
  const { configFor, ready, missing } = useTechos();
  const { recurring, txs } = useStore();
  const items = useBudgetItems(month);
  return useMemo(() => {
    if (!ready || missing || !items) return null;
    const isCurrent = month === currentMonth();
    const pending = isCurrent ? pendingFijos(recurring, txs, month) : [];
    return configFor(month)
      .map((cfg) => budgetStatus(cfg, items, month, { today: isCurrent ? todayISO() : undefined, pendingFijos: pending }))
      .sort((a, b) => b.pct - a.pct);
  }, [ready, missing, items, month, configFor, recurring, txs]);
}

/** Una barra: gastado (sólido), fijos que vienen (tenue) y una marca del ritmo esperado a hoy */
export function BudgetBar({ s, expectedPct }: { s: BudgetStatus; expectedPct?: number }) {
  const { categories } = useStore();
  const emojis = s.cfg.category_ids
    .map((id) => categories.find((c) => c.id === id)?.emoji)
    .filter(Boolean)
    .slice(0, 3)
    .join("");
  const spentW = Math.min(100, s.pct * 100);
  const commitW = Math.max(0, Math.min(100 - spentW, (s.committed / s.cfg.monthly) * 100));
  const color = TONE[s.level];
  return (
    <div className="grid gap-1.5">
      {/* Nombre completo y % arriba; los montos van abajo para que nada se corte */}
      <div className="flex items-baseline gap-2 text-sm">
        <span className="shrink-0">{emojis || "🎯"}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{s.cfg.name}</span>
        <span className="num shrink-0 text-sm font-semibold" style={{ color }}>
          {Math.round(s.pct * 100)}%
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-line" data-monto>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${spentW}%`, background: color, transition: "width .6s ease" }} />
        {commitW > 0 && (
          <div
            className="absolute inset-y-0 rounded-full opacity-35"
            style={{ left: `${spentW}%`, width: `${commitW}%`, background: color }}
            title="Fijos que vienen este mes"
          />
        )}
        {expectedPct !== undefined && expectedPct < 1 && (
          <div className="absolute inset-y-0 w-0.5 bg-fg/40" style={{ left: `${expectedPct * 100}%` }} title="Ritmo parejo a hoy" />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        <span className="num">
          <b className="text-fg">{money(s.spent)}</b> de {money(s.cfg.monthly)}
          {s.level === "over" ? (
            <b className="text-exp"> · +{money(s.spent - s.cfg.monthly)}</b>
          ) : (
            <> · quedan {money(s.cfg.monthly - s.spent)}</>
          )}
        </span>
        {s.week && (
          <span className={s.week.spent > s.cfg.weekly! ? "font-semibold text-exp" : ""}>
            Semana: {money(s.week.spent)} de {money(s.cfg.weekly!)}
          </span>
        )}
        {s.committed > 0 && <span>+{money(s.committed)} de fijos que vienen</span>}
        {s.excesses.length > 0 && (
          <span className="font-semibold text-exp">
            {s.excesses.length} {s.excesses.length === 1 ? "exceso" : "excesos"}
          </span>
        )}
      </div>
    </div>
  );
}

/** Tarjeta de Inicio: todos los techos del mes */
export function TechosCard({ delay = 0 }: { delay?: number }) {
  const { month } = useStore();
  const { ready, missing, budgets } = useTechos();
  const statuses = useBudgetStatuses(month);
  if (!ready || missing) return null;
  if (!budgets.length) {
    return (
      <Link href="/techos" className="glass press rise flex items-center gap-3 rounded-3xl px-4 py-3.5" style={{ animationDelay: `${delay}ms` }}>
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inset text-lg">🎯</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Poné techos a tus gastos</span>
          <span className="block truncate text-xs text-muted">Te avisa al cargar cuánto te queda en cada categoría</span>
        </span>
        <ChevronRight width={18} height={18} className="shrink-0 text-muted" />
      </Link>
    );
  }
  if (!statuses) return <div className="skeleton h-40" />;

  const isCurrent = month === currentMonth();
  const dim = daysInMonth(month);
  const day = isCurrent ? Number(todayISO().slice(8, 10)) : dim;
  const left = dim - day;
  const spent = statuses.reduce((a, s) => a + s.spent, 0);
  const limit = statuses.reduce((a, s) => a + s.cfg.monthly, 0);

  return (
    <section className="glass rise rounded-[28px] p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Techos</h2>
        <Link href="/techos" className="text-xs text-muted">
          Editar
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">
        Gastado en categorías con techo:{" "}
        <b className={`num ${spent > limit ? "text-exp" : "text-fg"}`}>
          {money(spent)} de {money(limit)}
        </b>
        {isCurrent ? (left > 0 ? ` · faltan ${left} ${left === 1 ? "día" : "días"}` : " · último día") : ` · ${monthLabel(month).split(" ")[0].toLowerCase()} cerrado`}
      </p>
      <p className="-mt-3 mb-4 text-[11px] text-muted">Las compras con tarjeta cuentan el día que compraste, no cuando se pagan.</p>
      <ul className="grid gap-2">
        {statuses.map((s) => (
          <li key={s.cfg.id}>
            {/* Tocar un techo muestra sus movimientos */}
            <Link href={`/movimientos?techo=${s.cfg.id}`} className="press -mx-2 block rounded-2xl px-2 py-1 hover:bg-surface">
              <BudgetBar s={s} expectedPct={isCurrent ? day / dim : undefined} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Hoy podés gastar $X": lo que te queda en todos los techos (descontando los fijos de esas
 * categorías que faltan) dividido por los días que quedan, incluido hoy. Se calcula con todo lo del
 * mes salvo lo de hoy (incluye cuotas que cuentan más adelante), así el número del día no se achica
 * mientras gastás: lo de hoy se descuenta aparte.
 */
export function useHoyPodes() {
  const { recurring, txs } = useStore();
  const { ready, missing, budgets, configFor } = useTechos();
  const month = currentMonth();
  const items = useBudgetItems(month);
  return useMemo(() => {
    if (!ready || missing || !items || !budgets.length) return null;
    const cfgs = configFor(month);
    const cats = new Set(cfgs.flatMap((c) => c.category_ids));
    const today = todayISO();
    const mine = items.filter((i) => i.categoryId && cats.has(i.categoryId) && i.date.startsWith(month));
    const sum = (f: (d: string) => boolean) => mine.filter((i) => f(i.date)).reduce((a, i) => a + i.amount, 0);
    const limit = cfgs.reduce((a, c) => a + c.monthly, 0);
    // Todo lo del mes menos lo de hoy: también cuotas o compras que cuentan más adelante en el mes
    const before = sum((d) => d !== today);
    const spentToday = sum((d) => d === today);
    const pending = pendingFijos(recurring, txs, month)
      .filter((r) => r.category_id && cats.has(r.category_id))
      .reduce((a, r) => a + Number(r.amount), 0);
    const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
    const pool = limit - before - pending;
    const daily = Math.max(0, pool) / daysLeft;
    return { limit, pool, daily, spentToday, left: daily - spentToday, daysLeft, pending };
  }, [ready, missing, items, budgets.length, configFor, month, recurring, txs]);
}

export function HoyPodes({ delay = 0 }: { delay?: number }) {
  const h = useHoyPodes();
  if (!h) return null;
  const over = h.left < 0;
  const pct = h.daily > 0 ? Math.min(1, h.spentToday / h.daily) : h.spentToday > 0 ? 1 : 0;
  return (
    <Link href="/techos" className="glass press rise grid gap-2.5 rounded-[28px] p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{over ? "Hoy te pasaste" : "Hoy podés gastar"}</p>
          <p className={`num text-3xl font-semibold leading-tight tracking-tight ${over ? "text-exp" : ""}`}>{moneyRound(Math.abs(h.left))}</p>
        </div>
        <p className="shrink-0 pb-1 text-right text-xs text-muted">
          {h.spentToday > 0 ? (
            <>
              Llevás <b className="num text-fg">{moneyRound(h.spentToday)}</b> hoy
            </>
          ) : (
            "Todavía no gastaste hoy"
          )}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-inset">
        <div className={`h-full rounded-full ${over ? "bg-exp" : pct >= 0.8 ? "bg-amber-500" : "bg-accent2"}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="text-xs text-muted">
        {h.pool > 0 ? (
          <>
            Te quedan <b className="num text-fg">{moneyRound(h.pool)}</b> en tus techos para {h.daysLeft === 1 ? "hoy" : `${h.daysLeft} días`} ·{" "}
            <span className="num">{moneyRound(h.daily)}</span> por día
            {h.pending > 0 && <> (ya descontados {moneyRound(h.pending)} de fijos)</>}
          </>
        ) : (
          <>
            Ya usaste los techos del mes: vas <b className="num text-exp">{moneyRound(-h.pool)}</b> arriba. Lo ideal es no sumar más hasta fin de mes.
          </>
        )}
      </p>
    </Link>
  );
}

/** Lo que pasa con el techo si guardás este gasto (null si la categoría no tiene techo) */
export function useBudgetCheck(input: {
  categoryId: string | null;
  date: string;
  monthAmount: number;
  eventAmount: number;
  excludeTxId?: string | null;
  excludePurchaseId?: string | null;
  enabled?: boolean;
}): Check | null {
  const { budgetOf } = useTechos();
  const month = input.date.slice(0, 7);
  const cfg = input.enabled === false ? null : budgetOf(input.categoryId, month);
  const items = useBudgetItems(month);
  return useMemo(
    () =>
      cfg && items
        ? checkExpense(cfg, items, {
            date: input.date,
            monthAmount: input.monthAmount,
            eventAmount: input.eventAmount,
            excludeTxId: input.excludeTxId,
            excludePurchaseId: input.excludePurchaseId,
          })
        : null,
    [cfg, items, input.date, input.monthAmount, input.eventAmount, input.excludeTxId, input.excludePurchaseId],
  );
}

/** Aviso del techo debajo del monto al cargar un gasto */
export function BudgetHint({ check, amount, date }: { check: Check | null; amount: number; date: string }) {
  if (!check) return null;
  const when = date.slice(0, 7) === currentMonth() ? "este mes" : `en ${monthLabel(date.slice(0, 7)).split(" ")[0].toLowerCase()}`;
  const total = amount > 0 ? check.after : check.before;
  const left = check.cfg.monthly - total;
  const box =
    check.level === "over"
      ? "border-exp/40 bg-exp/10"
      : check.level === "warn"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-line bg-inset";
  return (
    <div className={`grid gap-1 rounded-2xl border px-3.5 py-2.5 text-sm ${box}`} role={check.level === "over" ? "alert" : undefined}>
      <p className="text-muted">
        <b className="text-fg">{check.cfg.name}:</b> {amount > 0 ? "con este, llevás" : "llevás"}{" "}
        <b className="num text-fg">{money(total)}</b> de <span className="num">{money(check.cfg.monthly)}</span> {when}
        {left >= 0 ? (
          <>
            {" "}
            · te quedan <b className="num text-fg">{money(left)}</b>
          </>
        ) : null}
      </p>
      {check.week && (
        <p className="text-xs text-muted">
          Esta semana: <span className="num">{money(amount > 0 ? check.week.after : check.week.before)}</span> de{" "}
          <span className="num">{money(check.week.limit)}</span>
        </p>
      )}
      {amount > 0 &&
        check.reasons.map((r) => (
          <p key={r} className="font-semibold text-exp">
            ⛔ {r}
          </p>
        ))}
      {amount > 0 &&
        check.warnings.map((w) => (
          <p key={w} className="font-medium text-amber-600 dark:text-amber-400">
            ⚠️ {w}
          </p>
        ))}
    </div>
  );
}
