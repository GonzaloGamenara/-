"use client";

import { useState } from "react";
import { money, parseAmount } from "@/lib/format";
import { KIND_EMOJI, KIND_LABEL, type AssetInput } from "@/lib/patrimonio";
import type { Asset, AssetKind } from "@/lib/types";
import { Sheet } from "./Sheet";
import { TrashIcon } from "./Icons";

const fmt = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
/** Como parseAmount, pero respeta el signo (una cuenta puede estar en negativo) */
const parseSigned = (s: string) => (/^\s*[-−]/.test(s) ? -1 : 1) * parseAmount(s);

/** Alta/edición de algo del patrimonio: cuenta, CEDEAR/acción, fondo u otro. */
export function AssetForm({
  initial,
  livePrice,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Partial<Asset>;
  /** Precio actual del ticker, si la cotización automática lo trae */
  livePrice?: number | null;
  onClose: () => void;
  onSave: (a: AssetInput) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
}) {
  const [kind, setKind] = useState<AssetKind>(initial.kind ?? "cuenta");
  const [name, setName] = useState(initial.name ?? "");
  const [broker, setBroker] = useState(initial.broker ?? "");
  const [ticker, setTicker] = useState(initial.ticker ?? "");
  const [qty, setQty] = useState(fmt(initial.quantity));
  const [price, setPrice] = useState(fmt(initial.last_price));
  const [balance, setBalance] = useState(fmt(initial.balance));
  const [currency, setCurrency] = useState<"ARS" | "USD">(initial.currency ?? "ARS");
  const [rate, setRate] = useState(fmt(initial.rate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCedear = kind === "cedear";
  const qtyNum = parseAmount(qty);
  const priceNum = parseAmount(price);
  const valid = (isCedear ? ticker.trim() && qtyNum > 0 : true) && (name.trim() || (isCedear && ticker.trim()));
  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg outline-none placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title={initial.id ? `Editar ${initial.name}` : "Agregar a tu patrimonio"}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          const err = await onSave({
            ...initial,
            kind,
            name: name.trim() || ticker.trim().toUpperCase(),
            broker,
            ticker,
            quantity: qtyNum,
            // Precio a mano: solo si no hay cotización automática o si lo cambiaste
            last_price: isCedear ? (priceNum > 0 ? priceNum : (livePrice ?? null)) : null,
            price_at: isCedear && priceNum > 0 && priceNum !== initial.last_price ? new Date().toISOString() : initial.price_at,
            balance: parseSigned(balance),
            currency,
            rate: rate.trim() ? parseAmount(rate) : null,
          });
          setBusy(false);
          if (err) setError(err);
          else onClose();
        }}
      >
        {!initial.id && (
          <div className="grid grid-cols-4 rounded-2xl bg-inset p-1 text-xs font-semibold">
            {(Object.keys(KIND_LABEL) as AssetKind[]).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`grid gap-0.5 rounded-xl py-2 ${kind === k ? "bg-bg text-fg shadow-sm" : "text-muted"}`}
              >
                <span className="text-base">{KIND_EMOJI[k]}</span>
                {k === "cedear" ? "CEDEAR" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        {isCedear ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm text-muted">
              Ticker
              <input
                className={`${field} uppercase`}
                autoComplete="off"
                autoCapitalize="characters"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.replace(/[^a-zA-Z0-9.]/g, ""))}
                placeholder="SPY"
                maxLength={10}
              />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Nominales
              <input className={field} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="10" />
            </label>
            <label className="col-span-2 grid gap-1 text-sm text-muted">
              Precio por nominal (opcional)
              <input
                className={field}
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={livePrice ? `Hoy: ${money(livePrice)}` : "Se busca solo; si no aparece, cargalo"}
              />
            </label>
          </div>
        ) : (
          <>
            <label className="grid gap-1 text-sm text-muted">
              Nombre
              <input
                className={field}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "cuenta" ? "Galicia, Mercado Pago…" : kind === "fondo" ? "Fondo LECAP, money market…" : "Plazo fijo, cripto…"}
                maxLength={40}
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1 text-sm text-muted">
                {kind === "cuenta" ? "Saldo" : "Valor hoy"}
                <input className={field} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Ej: 250.000 (o -28.780 si está en negativo)" />
              </label>
              <div className="grid grid-cols-2 rounded-xl bg-inset p-1 text-xs font-semibold">
                {(["ARS", "USD"] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`rounded-lg px-3 py-2.5 ${currency === c ? "bg-bg text-fg shadow-sm" : "text-muted"}`}
                  >
                    {c === "ARS" ? "$" : "US$"}
                  </button>
                ))}
              </div>
            </div>
            {kind === "fondo" && (
              <label className="grid gap-1 text-sm text-muted">
                Rendimiento anual estimado, TNA % (opcional)
                <input className={field} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ej: 32" />
                <span className="text-xs">Con esto el valor crece solo entre una actualización y otra.</span>
              </label>
            )}
          </>
        )}

        <label className="grid gap-1 text-sm text-muted">
          {isCedear ? "Nombre y dónde está (opcional)" : "Dónde está (opcional)"}
          <div className={isCedear ? "grid grid-cols-2 gap-2" : ""}>
            {isCedear && (
              <input className={field} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="S&P 500" maxLength={40} />
            )}
            <input className={field} autoComplete="off" value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="Balanz, IOL…" maxLength={30} />
          </div>
        </label>

        {error && <p className="rounded-2xl bg-exp/10 px-3 py-2 text-sm text-exp">{error}</p>}

        <div className="flex gap-2">
          {initial.id && onDelete && (
            <button
              type="button"
              aria-label="Borrar"
              onClick={async () => {
                if (!confirm(`¿Borrar “${initial.name}” de tu patrimonio?`)) return;
                const err = await onDelete();
                if (err) setError(err);
                else onClose();
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
