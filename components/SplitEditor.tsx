"use client";

import { useEffect, useState } from "react";
import type { SplitShare } from "@/lib/store";
import { money, parseAmount } from "@/lib/format";
import { XIcon } from "./Icons";

const fmt = (n: number) => (n > 0 ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n) : "");
const equalParts = (total: number, people: number) => Math.floor((total / (people + 1)) * 100) / 100;

/**
 * Personas con las que dividís un gasto (distintas cada vez: se escriben en el momento).
 * Por defecto partes iguales; cada monto se puede editar. Tu parte = total − lo de los demás.
 */
export function SplitEditor({
  total,
  value,
  onChange,
}: {
  total: number;
  value: SplitShare[];
  onChange: (v: SplitShare[]) => void;
}) {
  const [name, setName] = useState("");
  const [custom, setCustom] = useState(false);
  const [version, setVersion] = useState(0); // remonta los inputs cuando se recalcula

  const rebalance = (list: SplitShare[]) => list.map((p) => ({ ...p, amount: equalParts(total, list.length) }));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const next = [...value, { name: n, amount: 0 }];
    onChange(custom ? next.map((p, i) => (i === next.length - 1 ? { ...p, amount: equalParts(total, next.length) } : p)) : rebalance(next));
    setName("");
    setVersion((v) => v + 1);
  };
  const others = value.reduce((a, p) => a + p.amount, 0);
  const mine = Math.round((total - others) * 100) / 100;

  // Si cambia el total y no tocaste montos, se mantienen partes iguales
  useEffect(() => {
    if (custom || !value.length) return;
    const eq = equalParts(total, value.length);
    if (value.some((p) => p.amount !== eq)) {
      onChange(value.map((p) => ({ ...p, amount: eq })));
      setVersion((v) => v + 1);
    }
  }, [total, custom, value, onChange]);

  return (
    <div className="grid gap-2.5 rounded-2xl bg-inset p-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Nombre (ej: Juli)"
          maxLength={30}
          enterKeyHint="done"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-fg placeholder:text-muted/70 focus:border-accent2"
        />
        <button type="button" onClick={add} disabled={!name.trim()} className="press shrink-0 rounded-xl bg-fg px-4 text-sm font-semibold text-bg disabled:opacity-30">
          Sumar
        </button>
      </div>

      {value.length > 0 && (
        <ul className="grid gap-1.5">
          {value.map((p, i) => (
            <li key={`${i}-${version}`} className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bg text-sm font-semibold">{p.name[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <span className="text-sm text-muted">$</span>
              <input
                defaultValue={fmt(p.amount)}
                inputMode="decimal"
                aria-label={`Parte de ${p.name}`}
                onChange={(e) => {
                  setCustom(true);
                  onChange(value.map((x, j) => (j === i ? { ...x, amount: parseAmount(e.target.value) } : x)));
                }}
                className="w-24 rounded-lg border border-line bg-bg px-2 py-1.5 text-right text-sm text-fg focus:border-accent2"
              />
              <button
                type="button"
                aria-label={`Quitar a ${p.name}`}
                onClick={() => {
                  const next = value.filter((_, j) => j !== i);
                  onChange(custom ? next : rebalance(next));
                  setVersion((v) => v + 1);
                }}
                className="press grid size-7 place-items-center rounded-full text-muted"
              >
                <XIcon width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className={mine < 0 ? "text-exp" : "text-muted"}>
          Tu parte: <b className={`num ${mine < 0 ? "" : "text-fg"}`}>{money(Math.max(mine, 0))}</b>
          {mine < 0 && " · se pasa del total"}
        </span>
        {value.length > 0 && custom && (
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(rebalance(value));
              setVersion((v) => v + 1);
            }}
            className="text-xs font-medium text-accent2"
          >
            Partes iguales
          </button>
        )}
      </div>
    </div>
  );
}

export const splitIsValid = (total: number, shares: SplitShare[]) =>
  shares.reduce((a, p) => a + p.amount, 0) <= total + 0.001;
