"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { toISO, todayISO } from "@/lib/format";
import type { Kind } from "@/lib/types";
import { Sheet } from "./Sheet";
import { BackspaceIcon, TrashIcon } from "./Icons";

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
  const { sheet, closeSheet, categories, txs, prevTxs, addTx, updateTx, deleteTx } = useStore();
  const editing = sheet.editing ?? null;

  const [kind, setKind] = useState<Kind>(editing?.kind ?? sheet.kind ?? "expense");
  const [raw, setRaw] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [catId, setCatId] = useState<string | null>(editing?.category_id ?? null);
  const [note, setNote] = useState(editing?.note ?? "");
  const [date, setDate] = useState(editing?.occurred_on ?? todayISO());
  const [keepOpen, setKeepOpen] = useState(false);
  const [flash, setFlash] = useState(false);
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
  const valid = amount > 0;
  const yesterday = toISO(new Date(Date.now() - 864e5));

  async function save() {
    if (!valid) return;
    const payload = { kind, amount, category_id: catId, note: note.trim() || null, occurred_on: date };
    if (editing) {
      await updateTx(editing.id, payload);
      closeSheet();
      return;
    }
    if (keepOpen) {
      addTx(payload);
      setRaw("");
      setNote("");
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
      navigator.vibrate?.(12);
    } else {
      addTx(payload);
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
        <div className="grid flex-1 grid-cols-2 rounded-full bg-surface p-1 text-sm font-semibold">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full py-2 transition-colors ${
                kind === k ? (k === "expense" ? "bg-exp text-white" : "bg-inc text-black") : "text-muted"
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
            className="press grid size-10 place-items-center rounded-full bg-surface text-exp"
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
          className="mx-auto mt-1 w-full max-w-xs bg-transparent text-center text-[15px] outline-none placeholder:text-muted/70"
        />
      </div>

      {/* Categorías */}
      <div className="hide-scroll -mx-5 mb-3 overflow-x-auto px-5">
        <div className="grid auto-cols-[84px] grid-flow-col grid-rows-2 gap-2">
          {ordered.map((c) => {
            const on = c.id === catId;
            return (
              <button
                key={c.id}
                onClick={() => setCatId(on ? null : c.id)}
                className={`press flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 text-[11px] font-medium leading-tight ${
                  on ? "border-transparent text-black" : "border-line bg-surface text-fg"
                }`}
                style={on ? { background: c.color } : undefined}
              >
                <span className="text-xl">{c.emoji}</span>
                <span className="line-clamp-2 min-h-[2.4em] w-full break-words text-center">{c.name}</span>
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
            className={`press rounded-full px-3.5 py-1.5 font-medium ${date === d.v ? "bg-fg text-bg" : "bg-surface text-muted"}`}
          >
            {d.label}
          </button>
        ))}
        <button
          onClick={() => (dateRef.current?.showPicker?.(), dateRef.current?.focus())}
          className={`press relative rounded-full px-3.5 py-1.5 font-medium ${
            date !== todayISO() && date !== yesterday ? "bg-fg text-bg" : "bg-surface text-muted"
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

      {/* Teclado */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setRaw((r) => press(r, k))}
            aria-label={k === "⌫" ? "Borrar dígito" : k}
            className="press num grid h-[52px] place-items-center rounded-2xl bg-surface text-2xl font-medium"
          >
            {k === "⌫" ? <BackspaceIcon width={24} height={24} /> : k}
          </button>
        ))}
      </div>

      <button
        onClick={save}
        disabled={!valid}
        className="press w-full rounded-2xl py-4 text-base font-semibold text-black transition-opacity disabled:opacity-35"
        style={{ background: isExp ? "var(--exp)" : "var(--inc)" }}
      >
        {editing ? "Guardar cambios" : isExp ? "Guardar gasto" : "Guardar ingreso"}
      </button>
    </Sheet>
  );
}
