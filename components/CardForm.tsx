"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { CARD_COLORS } from "@/lib/cards";
import type { Card } from "@/lib/types";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";
import { AccountPicker } from "./AccountPicker";

export function CardForm({ initial, onClose }: { initial: Partial<Card>; onClose: () => void }) {
  const { saveCard, deleteCard, cards } = useStore();
  // Migración 011: día de cierre
  const closingReady = cards.some((c) => "closing_day" in c);
  const [name, setName] = useState(initial.name ?? "");
  const [color, setColor] = useState(initial.color ?? CARD_COLORS[0]);
  const [day, setDay] = useState(String(initial.due_day ?? 10));
  const [closing, setClosing] = useState(initial.closing_day ? String(initial.closing_day) : "");
  const closingNum = closing ? Number(closing) : null;
  const [accountId, setAccountId] = useState<string | null | undefined>(initial.account_id);
  const [busy, setBusy] = useState(false);
  const dayNum = Number(day);
  const valid = name.trim() && dayNum >= 1 && dayNum <= 31 && (closingNum === null || (closingNum >= 1 && closingNum <= 31));
  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title={initial.id ? "Editar tarjeta" : "Nueva tarjeta"}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          await saveCard({ ...initial, name, color, due_day: dayNum, ...(closingReady ? { closing_day: closingNum } : {}), ...(accountId !== undefined ? { account_id: accountId } : {}) });
          onClose();
        }}
      >
        <div
          className="flex h-28 flex-col justify-between rounded-2xl p-4 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` }}
        >
          <span className="font-semibold">{name || "Mi tarjeta"}</span>
          <span className="text-sm opacity-80">
            {closingNum ? `Cierra el ${closingNum} · ` : ""}Pago el día {dayNum || "–"}
          </span>
        </div>
        <label className="grid gap-1 text-sm text-muted">
          Nombre
          <input className={field} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Visa Galicia, Naranja…" maxLength={30} />
        </label>
        <div className={closingReady ? "grid grid-cols-2 gap-3" : "grid"}>
          <label className="grid gap-1 text-sm text-muted">
            Día de pago
            <input className={field} inputMode="numeric" maxLength={2} value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ""))} />
          </label>
          {closingReady && (
            <label className="grid gap-1 text-sm text-muted">
              Día de cierre
              <input
                className={field}
                inputMode="numeric"
                maxLength={2}
                value={closing}
                placeholder="Opcional"
                onChange={(e) => setClosing(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          )}
        </div>
        {closingReady && (
          <p className="-mt-2 text-xs text-muted">
            {closingNum
              ? `Lo que compres después del ${closingNum} va al resumen siguiente. Si el cierre cambia un poco cada mes, poné el más habitual.`
              : "Con el día de cierre, lo que compres después del cierre va solo al resumen siguiente."}
          </p>
        )}
        <AccountPicker label="El resumen se debita de" value={accountId} onChange={setAccountId} />
        <div className="flex flex-wrap gap-2.5">
          {CARD_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`size-9 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {initial.id && (
            <button
              type="button"
              aria-label="Borrar tarjeta"
              onClick={async () => {
                if (confirm("¿Borrar la tarjeta? Se borran también sus compras y cuotas. Las suscripciones pasan a ser fijos sin tarjeta.")) {
                  await deleteCard(initial.id!);
                  onClose();
                }
              }}
              className="press grid size-[3.25rem] shrink-0 place-items-center rounded-2xl bg-inset text-exp"
            >
              <TrashIcon width={20} height={20} />
            </button>
          )}
          <button disabled={!valid || busy} className="press flex-1 rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink disabled:opacity-40">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
