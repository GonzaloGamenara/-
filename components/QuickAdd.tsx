"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, type SplitShare } from "@/lib/store";
import { nextPaymentPeriod } from "@/lib/cards";
import { money, monthLabelCompact, toISO, todayISO } from "@/lib/format";
import { debtMessage, shareText } from "@/lib/share";
import { Sheet } from "./Sheet";
import { CategoryChips } from "./CategoryChips";
import { SplitEditor, splitIsValid } from "./SplitEditor";
import { AliasField } from "./AliasField";
import { BackspaceIcon, CardIcon, TrashIcon } from "./Icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"] as const;
type Mode = "expense" | "income" | "split";

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
  { id: "split", label: "Dividir" },
];

export function QuickAdd() {
  const { sheet, closeSheet, categories, addTx, updateTx, deleteTx, cards, savePurchase, openPurchase, splits, alias } = useStore();
  const editing = sheet.editing ?? null;

  const [mode, setMode] = useState<Mode>(editing ? editing.kind : sheet.split ? "split" : (sheet.kind ?? "expense"));
  const [raw, setRaw] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [catId, setCatId] = useState<string | null>(editing?.category_id ?? null);
  const [note, setNote] = useState(editing?.note ?? "");
  const [date, setDate] = useState(editing?.occurred_on ?? todayISO());
  const [keepOpen, setKeepOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [payCard, setPayCard] = useState<string | null>(null);
  const [cuotas, setCuotas] = useState(1);
  const [shares, setShares] = useState<SplitShare[]>([]);
  const [busy, setBusy] = useState(false);
  // Después de dividir: a quién pedirle
  const [done, setDone] = useState<{ label: string; shares: SplitShare[] } | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const kind = mode === "income" ? "income" : "expense";
  const isSplit = mode === "split";

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
  const activeShares = isSplit ? shares.filter((s) => s.name.trim() && s.amount > 0) : [];
  const valid = amount > 0 && (!isSplit || activeShares.length > 0) && splitIsValid(amount, activeShares);
  const yesterday = toISO(new Date(Date.now() - 864e5));
  const editingShares = editing ? splits.filter((x) => x.transaction_id === editing.id) : [];

  const resetForNext = () => {
    setRaw("");
    setNote("");
    setShares([]);
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
    navigator.vibrate?.(12);
  };

  async function save() {
    if (!valid || busy) return;
    const label = note.trim() || categories.find((c) => c.id === catId)?.name || (isSplit ? "la cuenta" : "Compra");
    if (editing) {
      await updateTx(editing.id, { kind, amount, category_id: catId, note: note.trim() || null, occurred_on: date });
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
        first_period: nextPaymentPeriod(card),
        from_installment: 1,
        purchased_on: date,
        splits: activeShares,
      });
    } else {
      ok = await addTx({ kind, amount, category_id: catId, note: note.trim() || null, occurred_on: date }, activeShares);
    }
    setBusy(false);
    if (!ok) return;
    if (isSplit) return setDone({ label, shares: activeShares });
    if (keepOpen) resetForNext();
    else closeSheet();
  }
  saveRef.current = save;

  const tone = mode === "income" ? "text-inc" : "text-exp";

  // --- Pantalla final de "Dividir": pedirle a cada uno --------------------------
  if (done) {
    return (
      <Sheet open onClose={closeSheet} title="¡Listo! Ahora pediles">
        <div className="grid gap-4">
          <p className="-mt-2 text-sm text-muted">
            Se guardó {done.label}. En tus métricas cuenta solo tu parte. Mandale a cada uno lo suyo:
          </p>
          {!alias && <AliasField compact />}
          <ul className="grid gap-2">
            {done.shares.map((s) => (
              <li key={s.name} className="flex items-center gap-3 rounded-2xl bg-inset px-3 py-2.5">
                <span className="grid size-9 place-items-center rounded-full bg-bg font-semibold">{s.name[0]?.toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="num text-sm text-muted">{money(s.amount)}</span>
                </span>
                <button
                  onClick={() => shareText(debtMessage(s.name, [{ label: done.label, amount: s.amount }], alias))}
                  className="press rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-black"
                >
                  Pedir
                </button>
              </li>
            ))}
          </ul>
          <button onClick={closeSheet} className="press rounded-2xl bg-fg py-3.5 font-semibold text-bg">
            Listo
          </button>
          <p className="text-center text-xs text-muted">Después lo ves en Perfil → Gastos divididos, y marcás quién te pagó.</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={closeSheet} tall>
      {/* Modo */}
      <div className="mb-4 flex items-center gap-2">
        <div className={`grid flex-1 rounded-full bg-inset p-1 text-sm font-semibold ${editing ? "grid-cols-2" : "grid-cols-3"}`}>
          {MODES.filter((m) => !editing || m.id !== "split").map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-full py-2 transition-colors ${
                mode === m.id
                  ? m.id === "expense"
                    ? "bg-exp text-on-exp shadow-sm"
                    : m.id === "income"
                      ? "bg-inc text-on-inc shadow-sm"
                      : "bg-accent2 text-black shadow-sm"
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
        {isSplit && <p className="text-xs font-medium uppercase tracking-wide text-muted">Total de la cuenta</p>}
        <div
          className={`num flex items-baseline justify-center gap-1 font-semibold transition-colors ${
            flash ? "text-accent2" : amount > 0 ? (isSplit ? "text-fg" : tone) : "text-muted"
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
          placeholder={isSplit ? "¿Qué fue? (asado, cena…)" : mode === "expense" ? "¿En qué? (opcional)" : "¿De qué? (opcional)"}
          maxLength={80}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), noteRef.current?.blur())}
          className="mx-auto mt-2 w-full max-w-xs rounded-full bg-transparent px-4 py-2 text-center text-[15px] transition-colors placeholder:text-muted/80 focus:bg-inset"
        />
      </div>

      {/* Con quién (Dividir) */}
      {isSplit && (
        <div className="mb-3">
          <SplitEditor total={amount} value={shares} onChange={setShares} />
        </div>
      )}

      {/* Categoría */}
      <div className="mb-3">
        <CategoryChips kind={kind} value={catId} onChange={setCatId} />
      </div>

      {/* Cómo pagaste (gasto o división) */}
      {!editing && kind === "expense" && cards.length > 0 && (
        <div className="mb-3 grid gap-2">
          <div className="hide-scroll -mx-5 flex gap-1.5 overflow-x-auto px-5 text-sm">
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
                Va al resumen de {monthLabelCompact(nextPaymentPeriod(card))} (día {card.due_day})
                {cuotas > 1 && amount > 0 && ` · ${cuotas} cuotas de ${money(Math.round(amount / cuotas))}`}
              </p>
            </>
          )}
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
        {!editing && !isSplit && (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            Seguir cargando
            <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} className="size-4" />
          </label>
        )}
      </div>

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
        disabled={!valid || busy}
        className={`press w-full rounded-2xl py-4 text-base font-semibold transition-opacity disabled:opacity-35 ${
          mode === "income" ? "bg-inc text-on-inc" : isSplit ? "bg-accent2 text-black" : "bg-exp text-on-exp"
        }`}
      >
        {busy
          ? "Guardando…"
          : editing
            ? "Guardar cambios"
            : mode === "income"
              ? "Guardar ingreso"
              : isSplit
                ? activeShares.length
                  ? `Dividir entre ${activeShares.length + 1}`
                  : "Sumá con quién dividís"
                : card
                  ? cuotas > 1
                    ? `Guardar en ${cuotas} cuotas`
                    : "Guardar en tarjeta"
                  : "Guardar gasto"}
      </button>
    </Sheet>
  );
}
