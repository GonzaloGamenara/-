"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { installmentAmounts, periodForPurchase } from "@/lib/cards";
import { money, monthLabelCompact, toISO, todayISO } from "@/lib/format";
import { Sheet } from "./Sheet";
import { CategoryChips } from "./CategoryChips";
import { BackspaceIcon, CardIcon, SplitIcon, TrashIcon, XIcon } from "./Icons";
import { BudgetHint, useBudgetCheck } from "./Techos";
import { completeNote, suggestCategory, useCategoryIndex } from "@/lib/autoCategoria";

/** El relleno de abajo de la hoja (ver Sheet): el botón fijo lo cubre para no dejar ver lo de atrás */
const SHEET_PAD = "(max(1.25rem, env(safe-area-inset-bottom)) + var(--ios-gap, 0px))";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"] as const;
type Mode = "expense" | "income";

/** "1500,5" → "1.500,5" */
function display(raw: string) {
  if (!raw) return "0";
  const [int, dec] = raw.split(",");
  const grouped = (int || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec === undefined ? grouped : `${grouped},${dec}`;
}

function press(raw: string, key: string) {
  if (key === "⌫") return raw.slice(0, -1);
  if (key === ",") return raw.includes(",") ? raw : (raw || "0") + ",";
  const [int, dec] = raw.split(",");
  if (dec !== undefined && dec.length >= 2) return raw;
  if (dec === undefined && int.length >= 10) return raw;
  return raw === "0" ? key : raw + key;
}

const MODES: { id: Mode; label: string }[] = [
  { id: "expense", label: "Gasto" },
  { id: "income", label: "Ingreso" },
];

export function QuickAdd() {
  const router = useRouter();
  const { sheet, closeSheet, categories, addTx, updateTx, deleteTx, cards, savePurchase, openPurchase, splits, accounts, accountsReady, defaultAccount } = useStore();
  const editing = sheet.editing ?? null;

  const [mode, setMode] = useState<Mode>(editing ? editing.kind : (sheet.kind ?? "expense"));
  const [raw, setRaw] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [catId, setCatId] = useState<string | null>(editing?.category_id ?? null);
  const [note, setNote] = useState(editing?.note ?? "");
  const [date, setDate] = useState(editing?.occurred_on ?? todayISO());
  const [keepOpen, setKeepOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [payCard, setPayCard] = useState<string | null>(null);
  // Cuenta de la que sale (o a la que entra); null = la principal
  const [acct, setAcct] = useState<string | null>(editing?.account_id ?? null);
  const acctId = acct ?? defaultAccount;
  const showAccounts = accountsReady && accounts.length > 0 && !editing?.card_id;
  const [cuotas, setCuotas] = useState(1);
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const kind = mode;

  // Categoría automática: mientras escribís la nota se elige sola, salvo que ya hayas elegido una
  const index = useCategoryIndex();
  const [catTouched, setCatTouched] = useState(!!editing);
  const [autoCat, setAutoCat] = useState(false);
  const suggestion = useMemo(() => (note.trim() ? suggestCategory(index, note, kind, categories) : null), [index, note, kind, categories]);
  const completions = useMemo(
    () => (note.trim().length >= 2 ? completeNote(index, note, kind, categories) : []),
    [index, note, kind, categories],
  );
  useEffect(() => {
    if (catTouched) return;
    if (suggestion) {
      setCatId(suggestion.categoryId);
      setAutoCat(true);
    } else if (autoCat) {
      setCatId(null);
      setAutoCat(false);
    }
  }, [suggestion, catTouched, autoCat]);
  const pickCategory = (id: string | null) => {
    setCatId(id);
    setCatTouched(id !== null);
    setAutoCat(false);
  };

  // Si la categoría elegida no es del tipo actual, se descarta
  useEffect(() => {
    if (catId && !categories.find((c) => c.id === catId && c.kind === kind)) setCatId(null);
  }, [kind, catId, categories]);
  useEffect(() => {
    if (mode === "income") setPayCard(null);
  }, [mode]);

  // Teclado físico (escritorio): dígitos, coma, borrar y Enter para guardar
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement instanceof HTMLInputElement) return;
      if (e.key === "Enter") {
        e.preventDefault();
        saveRef.current();
      } else if (/^[0-9]$/.test(e.key) || e.key === "," || e.key === ".") setRaw((r) => press(r, e.key === "." ? "," : e.key));
      else if (e.key === "Backspace") setRaw((r) => press(r, "⌫"));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const amount = Number(raw.replace(",", ".")) || 0;
  const card = cards.find((c) => c.id === payCard);
  const valid = amount > 0;
  const yesterday = toISO(new Date(Date.now() - 864e5));
  const editingShares = editing ? splits.filter((x) => x.transaction_id === editing.id) : [];

  // Techo de la categoría: en cuotas, al mes de compra suma la cuota 1; en un gasto dividido, tu parte
  const myPart = editing && editing.my_share != null && editing.amount > 0 ? amount * (Number(editing.my_share) / editing.amount) : amount;
  const monthAmount = card && cuotas > 1 && amount > 0 ? installmentAmounts(amount, cuotas)[0] : myPart;
  const check = useBudgetCheck({
    categoryId: catId,
    date,
    monthAmount,
    eventAmount: myPart,
    excludeTxId: editing?.id,
    enabled: kind === "expense",
  });
  // Un aviso rojo no bloquea: pide un segundo toque ("Guardar igual")
  const needsConfirm = !!check && amount > 0 && check.reasons.length > 0;
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => setConfirmed(false), [amount, catId, date, payCard, cuotas]);

  const resetForNext = () => {
    setConfirmed(false);
    setRaw("");
    setNote("");
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
    navigator.vibrate?.(12);
  };

  async function save() {
    if (!valid || busy) return;
    if (needsConfirm && !confirmed) {
      setConfirmed(true);
      navigator.vibrate?.([10, 40, 10]);
      return;
    }
    if (editing) {
      await updateTx(editing.id, {
        kind,
        amount,
        category_id: catId,
        note: note.trim() || null,
        occurred_on: date,
        ...(showAccounts ? { account_id: acctId } : {}),
      });
      closeSheet();
      return;
    }
    setBusy(true);
    let ok: boolean;
    if (card && kind === "expense") {
      ok = await savePurchase({
        card_id: card.id,
        description: note.trim() || categories.find((c) => c.id === catId)?.name || "Compra",
        category_id: catId,
        total_amount: amount,
        installments: cuotas,
        first_period: periodForPurchase(card, date),
        from_installment: 1,
        purchased_on: date,
        splits: [],
      });
    } else {
      ok = await addTx({ kind, amount, category_id: catId, note: note.trim() || null, occurred_on: date, ...(showAccounts ? { account_id: acctId } : {}) });
    }
    setBusy(false);
    if (!ok) return;
    if (keepOpen) resetForNext();
    else closeSheet();
  }
  saveRef.current = save;

  const tone = mode === "income" ? "text-inc" : "text-exp";

  return (
    <Sheet open onClose={closeSheet} tall>
      {/* Modo (con cerrar siempre a mano: en el iPhone la hoja ocupa casi toda la pantalla) */}
      <div className="mb-3 flex items-center gap-2">
        <button onClick={closeSheet} aria-label="Cerrar" className="press grid size-10 shrink-0 place-items-center rounded-full bg-inset text-muted">
          <XIcon width={18} height={18} />
        </button>
        <div className="grid flex-1 grid-cols-2 rounded-full bg-inset p-1 text-sm font-semibold">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-full py-2 transition-colors ${
                mode === m.id
                  ? m.id === "expense"
                    ? "bg-exp text-on-exp shadow-sm"
                    : "bg-inc text-on-inc shadow-sm"
                  : "text-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {editing && (
          <button
            onClick={async () => {
              const extra = editing.recurring_id ? "\n\nEs un fijo: se vuelve a generar mientras siga activo (pausalo en Plan → Fijos)." : "";
              if (confirm("¿Borrar este movimiento?" + extra)) {
                await deleteTx(editing.id);
                closeSheet();
              }
            }}
            aria-label="Borrar"
            className="press grid size-10 place-items-center rounded-full bg-inset text-exp"
          >
            <TrashIcon width={18} height={18} />
          </button>
        )}
      </div>

      {/* Monto */}
      <div className="mb-2 text-center">
        <div
          data-monto
          className={`num flex items-baseline justify-center gap-1 font-semibold transition-colors ${
            flash ? "text-accent2" : amount > 0 ? tone : "text-muted"
          }`}
          style={{ fontSize: raw.length > 11 ? 38 : raw.length > 8 ? 46 : 56, lineHeight: 1.1 }}
        >
          <span className="text-[0.5em] opacity-70">$</span>
          {display(raw)}
        </div>
        <input
          ref={noteRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={mode === "expense" ? "¿En qué? (opcional)" : "¿De qué? (opcional)"}
          maxLength={80}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), noteRef.current?.blur())}
          className="mx-auto mt-1 w-full max-w-xs rounded-full bg-transparent px-4 py-1.5 text-center text-[15px] transition-colors placeholder:text-muted/80 focus:bg-inset"
        />
        {completions.length > 0 && (
          <div className="hide-scroll -mx-5 mt-1.5 flex justify-center gap-1.5 overflow-x-auto px-5">
            {completions.map((c) => {
              const cat = categories.find((x) => x.id === c.categoryId);
              return (
                <button
                  key={c.note}
                  type="button"
                  onClick={() => {
                    setNote(c.note);
                    setCatId(c.categoryId);
                    setCatTouched(false);
                    setAutoCat(true);
                  }}
                  className="press flex shrink-0 items-center gap-1 rounded-full bg-inset px-3 py-1.5 text-xs font-medium"
                >
                  {cat?.emoji} {c.note}
                </button>
              );
            })}
          </div>
        )}
      </div>


      {/* Categoría */}
      <div className="mb-3">
        <CategoryChips kind={kind} value={catId} onChange={pickCategory} suggestedId={autoCat ? catId : null} />
      </div>

      {kind === "expense" && check && (
        <div className="mb-3">
          <BudgetHint check={check} amount={amount} date={date} />
        </div>
      )}

      {/* Cómo pagaste: efectivo, tarjeta o entre varios */}
      {!editing && kind === "expense" && (
        <div className="mb-3 grid gap-2">
          <div className="hide-scroll -mx-5 flex gap-1.5 overflow-x-auto px-5 text-sm">
            {showAccounts ? (
              accounts.map((a) => (
                <AccountChip
                  key={a.id}
                  name={a.name}
                  on={!payCard && acctId === a.id}
                  onClick={() => {
                    setPayCard(null);
                    setAcct(a.id);
                  }}
                />
              ))
            ) : (
              <button
                onClick={() => setPayCard(null)}
                className={`press shrink-0 rounded-full px-3.5 py-1.5 font-medium ${!payCard ? "bg-fg text-bg" : "bg-inset text-muted"}`}
              >
                Efectivo / débito
              </button>
            )}
            {cards.map((c) => (
              <button
                key={c.id}
                onClick={() => setPayCard(c.id)}
                className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium ${payCard === c.id ? "bg-fg text-bg" : "bg-inset text-muted"}`}
              >
                <CardIcon width={15} height={15} style={{ color: c.color }} />
                {c.name}
              </button>
            ))}
            {mode === "expense" && (
              <button
                onClick={() => {
                  closeSheet();
                  router.push("/dividir?nueva=1");
                }}
                className="press flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 py-1.5 font-medium text-accent2"
              >
                <SplitIcon width={15} height={15} /> Entre varios
              </button>
            )}
          </div>
          {card && (
            <>
              <div className="hide-scroll -mx-5 flex items-center gap-1.5 overflow-x-auto px-5 text-sm">
                {[1, 3, 6, 12].map((q) => (
                  <button
                    key={q}
                    onClick={() => setCuotas(q)}
                    className={`press num shrink-0 rounded-full px-3 py-1 font-semibold ${cuotas === q ? "bg-fg text-bg" : "bg-inset text-muted"}`}
                  >
                    {q === 1 ? "1 pago" : `${q} cuotas`}
                  </button>
                ))}
                <button
                  onClick={() => {
                    closeSheet();
                    openPurchase({ cardId: card.id });
                  }}
                  className="shrink-0 px-2 text-xs font-medium text-accent2"
                >
                  Más opciones
                </button>
              </div>
              <p className="text-xs text-muted">
                Va al resumen de {monthLabelCompact(periodForPurchase(card, date))} (paga el {card.due_day}
                {card.closing_day ? `, cierra el ${card.closing_day}` : ""})
                {cuotas > 1 && amount > 0 && ` · ${cuotas} cuotas de ${money(Math.round(amount / cuotas))}`}
              </p>
            </>
          )}
        </div>
      )}

      {/* Ingresos (y movimientos que editás): a qué cuenta entró / de cuál salió */}
      {showAccounts && accounts.length > 1 && (editing || kind === "income") && (
        <div className="hide-scroll -mx-5 mb-3 flex gap-1.5 overflow-x-auto px-5 text-sm">
          {accounts.map((a) => (
            <AccountChip key={a.id} name={a.name} on={acctId === a.id} onClick={() => setAcct(a.id)} />
          ))}
        </div>
      )}

      {editing && editingShares.length > 0 && (
        <p className="mb-3 rounded-2xl bg-inset px-3.5 py-2.5 text-sm text-muted">
          Dividido con {editingShares.map((x) => x.name).join(", ")} · tu parte{" "}
          <b className="num text-fg">{money(editing.my_share ?? editing.amount)}</b>
        </p>
      )}

      {/* Fecha */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        {[
          { label: "Hoy", v: todayISO() },
          { label: "Ayer", v: yesterday },
        ].map((d) => (
          <button
            key={d.v}
            onClick={() => setDate(d.v)}
            className={`press rounded-full px-3.5 py-1.5 font-medium ${date === d.v ? "bg-fg text-bg" : "bg-inset text-muted"}`}
          >
            {d.label}
          </button>
        ))}
        <button
          onClick={() => (dateRef.current?.showPicker?.(), dateRef.current?.focus())}
          className={`press relative shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium ${
            date !== todayISO() && date !== yesterday ? "bg-fg text-bg" : "bg-inset text-muted"
          }`}
        >
          {date !== todayISO() && date !== yesterday
            ? new Date(date + "T00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })
            : "Otra fecha"}
          <input
            ref={dateRef}
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 opacity-0"
            aria-label="Elegir fecha"
          />
        </button>
        {!editing && (
          <label className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted">
            Cargar otro
            <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} className="size-4" />
          </label>
        )}
      </div>

      {/* Teclado */}
      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setRaw((r) => press(r, k))}
            aria-label={k === "⌫" ? "Borrar dígito" : k}
            className="press num grid h-[48px] place-items-center rounded-2xl bg-inset text-2xl font-medium"
          >
            {k === "⌫" ? <BackspaceIcon width={24} height={24} /> : k}
          </button>
        ))}
      </div>

      {/* En pantallas chicas la hoja scrollea: el botón de guardar queda siempre a la vista */}
      <div className="sticky z-10 -mx-5 bg-bg px-5 pt-1" style={{ bottom: `calc(-1 * ${SHEET_PAD})`, paddingBottom: `calc${SHEET_PAD}`, marginBottom: `calc(-1 * ${SHEET_PAD})` }}>
      <button
        onClick={save}
        disabled={!valid || busy}
        className={`press w-full rounded-2xl py-3.5 text-base font-semibold transition-colors disabled:!bg-inset disabled:!text-muted ${
          mode === "income" ? "bg-inc text-on-inc" : "bg-exp text-on-exp"
        } ${needsConfirm && confirmed ? "ring-4 ring-exp/30" : ""}`}
      >
        {busy
          ? "Guardando…"
          : needsConfirm && confirmed
            ? "Guardar igual"
            : editing
            ? "Guardar cambios"
            : mode === "income"
              ? "Guardar ingreso"
              : card
                  ? cuotas > 1
                    ? `Guardar en ${cuotas} cuotas`
                    : "Guardar en tarjeta"
                  : "Guardar gasto"}
      </button>
      </div>
    </Sheet>
  );
}

function AccountChip({ name, on, onClick }: { name: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium ${on ? "bg-fg text-bg" : "bg-inset text-muted"}`}
    >
      <span className="text-[13px]">🏦</span>
      {name}
    </button>
  );
}
