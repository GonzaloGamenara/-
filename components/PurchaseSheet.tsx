"use client";

import { useMemo, useState } from "react";
import { useStore, type SplitShare } from "@/lib/store";
import { installmentAmounts, nextPaymentPeriod } from "@/lib/cards";
import { launchMonth } from "@/lib/launch";
import { addMonths, money, monthLabelCompact, parseAmount, todayISO } from "@/lib/format";
import { Sheet } from "./Sheet";
import { CategoryChips } from "./CategoryChips";
import { MonthStepper } from "./MonthStepper";
import { SplitEditor, splitIsValid } from "./SplitEditor";
import { usePrelaunch } from "./LaunchGate";
import { MinusIcon, PlusIcon, TrashIcon } from "./Icons";

const QUICK = [1, 3, 6, 12, 18, 24];
const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);

/** Alta/edición de una compra con tarjeta: 1 pago, cuotas nuevas o un plan que ya venías pagando. */
export function PurchaseSheet() {
  const { purchaseSheet, closePurchase, cards, splits, savePurchase, deletePurchase } = useStore();
  const prelaunch = usePrelaunch();
  const editing = purchaseSheet.purchase ?? null;

  const [cardId, setCardId] = useState(editing?.card_id ?? purchaseSheet.cardId ?? cards[0]?.id ?? "");
  const card = cards.find((c) => c.id === cardId);
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [mode, setMode] = useState<"total" | "cuota">("total");
  const [amountRaw, setAmountRaw] = useState(editing ? fmt(editing.total_amount) : "");
  const [n, setN] = useState(editing?.installments ?? 1);
  const [paid, setPaid] = useState(editing ? editing.from_installment - 1 : 0);
  const [started, setStarted] = useState(editing ? editing.from_installment > 1 : false);
  const minPeriod = prelaunch ? launchMonth() : undefined;
  const [nextPeriod, setNextPeriod] = useState(() => {
    if (editing) return addMonths(editing.first_period, editing.from_installment - 1);
    const p = card ? nextPaymentPeriod(card) : addMonths(todayISO().slice(0, 7), 1);
    return minPeriod && p < minPeriod ? minPeriod : p;
  });
  const [catId, setCatId] = useState<string | null>(editing?.category_id ?? null);
  const [date, setDate] = useState(editing?.purchased_on ?? todayISO());
  const [shares, setShares] = useState<SplitShare[]>(() =>
    editing ? splits.filter((x) => x.purchase_id === editing.id).map((x) => ({ name: x.name, amount: x.amount, settled_on: x.settled_on })) : [],
  );
  const [splitOn, setSplitOn] = useState(shares.length > 0);
  const [busy, setBusy] = useState(false);

  const entered = parseAmount(amountRaw);
  const total = mode === "cuota" ? Math.round(entered * n * 100) / 100 : entered;
  const perInstallment = useMemo(() => (total > 0 ? installmentAmounts(total, n)[0] : 0), [total, n]);
  const paidCount = started ? Math.min(paid, n - 1) : 0;
  const left = n - paidCount;
  const lastPeriod = addMonths(nextPeriod, left - 1);
  const activeShares = splitOn ? shares : [];
  const valid = !!card && desc.trim().length > 0 && total > 0 && splitIsValid(total, activeShares);

  async function save() {
    if (!valid || !card) return;
    setBusy(true);
    const ok = await savePurchase({
      id: editing?.id,
      card_id: card.id,
      description: desc,
      category_id: catId,
      total_amount: total,
      installments: n,
      first_period: addMonths(nextPeriod, -paidCount),
      from_installment: paidCount + 1,
      purchased_on: date,
      splits: activeShares,
    });
    setBusy(false);
    if (ok) closePurchase();
  }

  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet open onClose={closePurchase} title={editing ? "Editar compra" : "Compra con tarjeta"} tall>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {cards.length > 1 && (
          <div className="hide-scroll -mx-5 flex gap-2 overflow-x-auto px-5">
            {cards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCardId(c.id);
                  if (!editing) {
                    const p = nextPaymentPeriod(c);
                    setNextPeriod(minPeriod && p < minPeriod ? minPeriod : p);
                  }
                }}
                aria-pressed={c.id === cardId}
                className={`press flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium ${c.id === cardId ? "bg-fg text-bg" : "bg-inset text-muted"}`}
              >
                <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        <label className="grid gap-1 text-sm text-muted">
          ¿Qué compraste?
          <input className={field} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Heladera, zapatillas, súper…" maxLength={60} />
        </label>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Monto</span>
            {n > 1 && (
              <div className="grid grid-cols-2 rounded-full bg-inset p-0.5 text-xs font-semibold">
                {(["total", "cuota"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (m !== mode && entered > 0) setAmountRaw(fmt(m === "cuota" ? perInstallment : total));
                      setMode(m);
                    }}
                    className={`rounded-full px-3 py-1 ${mode === m ? "bg-bg text-fg shadow-sm" : ""}`}
                  >
                    {m === "total" ? "Total" : "Por cuota"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input className={`${field} num text-lg font-semibold`} inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} placeholder="$ 0" />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <span className="text-sm text-muted">Cuotas</span>
          <div className="flex items-center gap-2">
            <div className="hide-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setN(q)}
                  className={`press num shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${n === q ? "bg-fg text-bg" : "bg-inset text-muted"}`}
                >
                  {q === 1 ? "1 pago" : q}
                </button>
              ))}
            </div>
            <div className="flex shrink-0 items-center rounded-full bg-inset">
              <button type="button" aria-label="Menos cuotas" onClick={() => setN((v) => Math.max(1, v - 1))} className="press grid size-8 place-items-center">
                <MinusIcon width={14} height={14} />
              </button>
              <span className="num w-7 text-center text-sm font-semibold">{n}</span>
              <button type="button" aria-label="Más cuotas" onClick={() => setN((v) => Math.min(72, v + 1))} className="press grid size-8 place-items-center">
                <PlusIcon width={14} height={14} />
              </button>
            </div>
          </div>
        </div>

        {n > 1 && (
          <div className="grid gap-2 rounded-2xl bg-inset p-3">
            <label className="flex items-center justify-between text-sm">
              Ya venía pagándola
              <input type="checkbox" checked={started} onChange={(e) => setStarted(e.target.checked)} className="size-5" />
            </label>
            {started && (
              <div className="flex items-center justify-between text-sm text-muted">
                <span>Cuotas ya pagadas</span>
                <div className="flex items-center rounded-full bg-bg">
                  <button type="button" aria-label="Menos" onClick={() => setPaid((v) => Math.max(0, v - 1))} className="press grid size-8 place-items-center">
                    <MinusIcon width={14} height={14} />
                  </button>
                  <span className="num w-8 text-center font-semibold text-fg">{paidCount}</span>
                  <button type="button" aria-label="Más" onClick={() => setPaid((v) => Math.min(n - 1, v + 1))} className="press grid size-8 place-items-center">
                    <PlusIcon width={14} height={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>{n > 1 ? `La cuota ${paidCount + 1} se paga en` : "Se paga en el resumen de"}</span>
          <MonthStepper value={nextPeriod} onChange={setNextPeriod} min={minPeriod} />
        </div>

        {total > 0 && (
          <p className="rounded-2xl border border-line px-4 py-3 text-sm text-muted">
            {n > 1 ? (
              <>
                <b className="num text-fg">{left} cuotas</b> de <b className="num text-fg">{money(perInstallment)}</b> · de {monthLabelCompact(nextPeriod)} a{" "}
                {monthLabelCompact(lastPeriod)}
                {paidCount > 0 && <> · te quedan {money(Math.round(perInstallment * left))}</>}
              </>
            ) : (
              <>
                Suma <b className="num text-fg">{money(total)}</b> al resumen de {monthLabelCompact(nextPeriod)}
                {card && <> (día {card.due_day})</>}
              </>
            )}
          </p>
        )}

        <div className="grid gap-1.5">
          <span className="text-sm text-muted">Categoría</span>
          <CategoryChips kind="expense" value={catId} onChange={setCatId} />
        </div>

        <label className="flex items-center justify-between gap-3 text-sm text-muted">
          Fecha de compra
          <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40 min-w-0 rounded-xl border border-line bg-inset px-3 py-2 text-fg" />
        </label>

        <div className="grid gap-2">
          <label className="flex items-center justify-between text-sm">
            <span>
              Dividir con otras personas
              <span className="block text-xs text-muted">En tus métricas cuenta solo tu parte</span>
            </span>
            <input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} className="size-5" />
          </label>
          {splitOn && <SplitEditor total={total} value={shares} onChange={setShares} />}
        </div>

        <div className="flex gap-2 pt-1">
          {editing && (
            <button
              type="button"
              aria-label="Borrar compra"
              onClick={async () => {
                if (confirm("¿Borrar la compra y todas sus cuotas?")) {
                  await deletePurchase(editing.id);
                  closePurchase();
                }
              }}
              className="press grid size-[3.25rem] shrink-0 place-items-center rounded-2xl bg-inset text-exp"
            >
              <TrashIcon width={20} height={20} />
            </button>
          )}
          <button onClick={save} disabled={!valid || busy} className="press flex-1 rounded-2xl bg-exp py-4 font-semibold text-on-exp disabled:opacity-35">
            {busy ? "Guardando…" : editing ? "Guardar cambios" : n > 1 ? `Guardar en ${n} cuotas` : "Guardar compra"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
