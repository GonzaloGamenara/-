"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type SplitShare } from "@/lib/store";
import { nextPaymentPeriod } from "@/lib/cards";
import { monthLabelCompact } from "@/lib/format";
import { SplitEditor, splitIsValid } from "./SplitEditor";
import { toISO, todayISO } from "@/lib/format";
import type { Kind } from "@/lib/types";
import { Sheet } from "./Sheet";
import { BackspaceIcon, CardIcon, SplitIcon, TrashIcon } from "./Icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"] as const;

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

export function QuickAdd() {
  const { sheet, closeSheet, categories, txs, prevTxs, addTx, updateTx, deleteTx, cards, savePurchase, openPurchase, splits } = useStore();
  const editing = sheet.editing ?? null;

  const [kind, setKind] = useState<Kind>(editing?.kind ?? sheet.kind ?? "expense");
  const [raw, setRaw] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [catId, setCatId] = useState<string | null>(editing?.category_id ?? null);
  const [note, setNote] = useState(editing?.note ?? "");
  const [date, setDate] = useState(editing?.occurred_on ?? todayISO());
  const [keepOpen, setKeepOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  // Pago con tarjeta (compra en 1 pago o cuotas) y división
  const [payCard, setPayCard] = useState<string | null>(null);
  const [cuotas, setCuotas] = useState(1);
  const [splitOn, setSplitOn] = useState(false);
  const [shares, setShares] = useState<SplitShare[]>([]);
  const noteRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // Categorías más usadas primero: cargar lo habitual es un toque
  const ordered = useMemo(() => {
    const uses = new Map<string, number>();
    for (const t of [...txs, ...prevTxs]) if (t.category_id) uses.set(t.category_id, (uses.get(t.category_id) ?? 0) + 1);
    return categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [categories, txs, prevTxs, kind]);

  // Si la categoría elegida no es del tipo actual, se descarta
  useEffect(() => {
    if (catId && !categories.find((c) => c.id === catId && c.kind === kind)) setCatId(null);
  }, [kind, catId, categories]);

  // Teclado físico (escritorio): dígitos, coma, borrar y Enter para guardar
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement instanceof HTMLInputElement) return;
      if (e.key === "Enter") {
        e.preventDefault();
        saveRef.current();
      }
      else if (/^[0-9]$/.test(e.key) || e.key === "," || e.key === ".") setRaw((r) => press(r, e.key === "." ? "," : e.key));
      else if (e.key === "Backspace") setRaw((r) => press(r, "⌫"));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const amount = Number(raw.replace(",", ".")) || 0;
  const card = cards.find((c) => c.id === payCard);
  const activeShares = splitOn && kind === "expense" ? shares : [];
  const valid = amount > 0 && splitIsValid(amount, activeShares);
  const editingShares = editing ? splits.filter((x) => x.transaction_id === editing.id) : [];
  const yesterday = toISO(new Date(Date.now() - 864e5));

  async function save() {
    if (!valid) return;
    const payload = { kind, amount, category_id: catId, note: note.trim() || null, occurred_on: date };
    if (!editing && card && kind === "expense") {
      const catName = categories.find((c) => c.id === catId)?.name;
      const ok = await savePurchase({
        card_id: card.id,
        description: note.trim() || catName || "Compra",
        category_id: catId,
        total_amount: amount,
        installments: cuotas,
        first_period: nextPaymentPeriod(card),
        from_installment: 1,
        purchased_on: date,
        splits: activeShares,
      });
      if (!ok) return;
      if (keepOpen) {
        setRaw("");
        setNote("");
        setShares([]);
      } else closeSheet();
      return;
    }
    if (editing) {
      await updateTx(editing.id, payload);
      closeSheet();
      return;
    }
    if (keepOpen) {
      addTx(payload, activeShares);
      setRaw("");
      setNote("");
      setShares([]);
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
      navigator.vibrate?.(12);
    } else {
      addTx(payload, activeShares);
      closeSheet();
    }
  }

  saveRef.current = save;
  const isExp = kind === "expense";
  const tone = isExp ? "text-exp" : "text-inc";

  return (
    <Sheet open onClose={closeSheet} tall>
      {/* Tipo */}
      <div className="mb-4 flex items-center gap-2">
        <div className="grid flex-1 grid-cols-2 rounded-full bg-inset p-1 text-sm font-semibold">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full py-2 transition-colors ${
                kind === k ? (k === "expense" ? "bg-exp text-on-exp shadow-sm" : "bg-inc text-on-inc shadow-sm") : "text-muted"
              }`}
            >
              {k === "expense" ? "Gasto" : "Ingreso"}
            </button>
          ))}
        </div>
        {editing && (
          <button
            onClick={async () => {
              const extra = editing.recurring_id ? "\n\nEs un fijo: se vuelve a generar mientras siga activo (pausalo en Fijos)." : "";
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
      <div className="mb-3 text-center">
        <div
          className={`num flex items-baseline justify-center gap-1 font-semibold transition-colors ${
            flash ? "text-accent2" : valid ? tone : "text-muted"
          }`}
          style={{ fontSize: raw.length > 11 ? 40 : raw.length > 8 ? 52 : 64, lineHeight: 1.1 }}
        >
          <span className="text-[0.5em] opacity-70">$</span>
          {display(raw)}
        </div>
        <input
          ref={noteRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isExp ? "¿En qué? (opcional)" : "¿De qué? (opcional)"}
          maxLength={80}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), noteRef.current?.blur())}
          className="mx-auto mt-2 w-full max-w-xs rounded-full bg-transparent px-4 py-2 text-center text-[15px] transition-colors placeholder:text-muted/80 focus:bg-inset"
        />
      </div>

      {/* Categorías */}
      <div className="hide-scroll -mx-5 mb-3 overflow-x-auto px-5">
        <div className="grid auto-cols-[92px] grid-flow-col grid-rows-2 gap-2">
          {ordered.map((c) => {
            const on = c.id === catId;
            return (
              <button
                key={c.id}
                onClick={() => setCatId(on ? null : c.id)}
                className={`press flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 text-[11px] font-medium leading-tight ${
                  on ? "border-transparent text-black" : "border-line bg-inset text-fg"
                }`}
                style={on ? { background: c.color } : undefined}
              >
                <span className="text-xl">{c.emoji}</span>
                <span className="line-clamp-2 min-h-[2.5em] w-full text-center leading-[1.25] [overflow-wrap:normal] [word-break:keep-all]">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

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
          className={`press relative rounded-full px-3.5 py-1.5 font-medium ${
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
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            Seguir cargando
            <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} className="size-4 accent-[var(--accent-2)]" />
          </label>
        )}
      </div>

      {/* Tarjeta y división (solo gastos nuevos) */}
      {!editing && isExp && (
        <div className="mb-3 grid gap-2">
          <div className="hide-scroll -mx-5 flex gap-1.5 overflow-x-auto px-5 text-sm">
            {cards.length > 0 && (
              <>
                <button
                  onClick={() => setPayCard(null)}
                  className={`press shrink-0 rounded-full px-3.5 py-1.5 font-medium ${!payCard ? "bg-fg text-bg" : "bg-inset text-muted"}`}
                >
                  Efectivo / débito
                </button>
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
              </>
            )}
            <button
              onClick={() => setSplitOn((v) => !v)}
              aria-pressed={splitOn}
              className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium ${splitOn ? "bg-accent2 text-black" : "bg-inset text-muted"}`}
            >
              <SplitIcon width={15} height={15} />
              Dividir
            </button>
          </div>
          {card && (
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
                className="ml-auto shrink-0 text-xs font-medium text-accent2"
              >
                Más opciones
              </button>
            </div>
          )}
          {card && (
            <p className="text-xs text-muted">
              Se suma al resumen de {monthLabelCompact(nextPaymentPeriod(card))} (día {card.due_day})
              {cuotas > 1 && amount > 0 && ` · ${cuotas} cuotas de $${Math.round(amount / cuotas).toLocaleString("es-AR")}`}
            </p>
          )}
          {splitOn && <SplitEditor total={amount} value={shares} onChange={setShares} />}
        </div>
      )}
      {editing && editingShares.length > 0 && (
        <p className="mb-3 rounded-2xl bg-inset px-3.5 py-2.5 text-sm text-muted">
          Dividido con {editingShares.map((x) => x.name).join(", ")} · tu parte{" "}
          <b className="num text-fg">${(editing.my_share ?? editing.amount).toLocaleString("es-AR")}</b>
        </p>
      )}

      {/* Teclado */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setRaw((r) => press(r, k))}
            aria-label={k === "⌫" ? "Borrar dígito" : k}
            className="press num grid h-[52px] place-items-center rounded-2xl bg-inset text-2xl font-medium"
          >
            {k === "⌫" ? <BackspaceIcon width={24} height={24} /> : k}
          </button>
        ))}
      </div>

      <button
        onClick={save}
        disabled={!valid}
        className={`press w-full rounded-2xl py-4 text-base font-semibold transition-opacity disabled:opacity-35 ${isExp ? "bg-exp text-on-exp" : "bg-inc text-on-inc"}`}
      >
        {editing ? "Guardar cambios" : !isExp ? "Guardar ingreso" : card ? (cuotas > 1 ? `Guardar en ${cuotas} cuotas` : "Guardar en tarjeta") : "Guardar gasto"}
      </button>
    </Sheet>
  );
}
