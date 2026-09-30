"use client";

import { useEffect, useState } from "react";
import { useStore, type SplitShare } from "@/lib/store";
import { money, parseAmount } from "@/lib/format";
import { XIcon } from "./Icons";

const fmt = (n: number) => (n > 0 ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n) : "");
const equalParts = (total: number, people: number) => (people > 0 ? Math.floor((total / people) * 100) / 100 : 0);

/**
 * Con quién dividís un gasto. Las personas cambian cada vez: se escriben en el momento
 * (con sugerencias de nombres usados antes). Partes iguales por defecto; cada monto se puede
 * editar. Tu parte = total − lo de los demás.
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
  const { recentNames } = useStore();
  const [name, setName] = useState("");
  const [custom, setCustom] = useState(false);
  const [includeMe, setIncludeMe] = useState(true);
  const [version, setVersion] = useState(0); // remonta los inputs cuando se recalcula

  const parts = (n: number) => n + (includeMe ? 1 : 0);
  const rebalance = (list: SplitShare[]) => list.map((p) => ({ ...p, amount: equalParts(total, parts(list.length)) }));

  const addName = (raw: string) => {
    const n = raw.trim();
    if (!n || value.some((p) => p.name.toLowerCase() === n.toLowerCase())) return setName("");
    const next = [...value, { name: n, amount: 0 }];
    onChange(custom ? next.map((p, i) => (i === next.length - 1 ? { ...p, amount: equalParts(total, parts(next.length)) } : p)) : rebalance(next));
    setName("");
    setVersion((v) => v + 1);
  };

  // Si cambia el total (o si te incluís), y no tocaste montos, se mantienen partes iguales
  useEffect(() => {
    if (custom || !value.length) return;
    const eq = equalParts(total, parts(value.length));
    if (value.some((p) => p.amount !== eq)) {
      onChange(value.map((p) => ({ ...p, amount: eq })));
      setVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, custom, value, includeMe]);

  const others = value.reduce((a, p) => a + p.amount, 0);
  const mine = Math.round((total - others) * 100) / 100;
  const suggestions = recentNames.filter((r) => !value.some((p) => p.name.toLowerCase() === r.toLowerCase()));

  return (
    <div className="grid gap-3 rounded-2xl bg-inset p-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addName(name))}
          placeholder="¿Con quién? Escribí un nombre"
          aria-label="Nombre"
          maxLength={30}
          enterKeyHint="done"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-fg placeholder:text-muted/70 focus:border-accent2"
        />
        <button
          type="button"
          onClick={() => addName(name)}
          disabled={!name.trim()}
          className="press shrink-0 rounded-xl bg-fg px-4 text-sm font-semibold text-bg disabled:opacity-30"
        >
          Sumar
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="hide-scroll -mx-3 flex gap-1.5 overflow-x-auto px-3">
          {suggestions.map((n) => (
            <button key={n} type="button" onClick={() => addName(n)} className="press shrink-0 rounded-full border border-line bg-bg px-3 py-1 text-xs font-medium">
              + {n}
            </button>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <ul className="grid gap-1.5">
          {includeMe && (
            <li className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent2/20 text-sm font-semibold">Yo</span>
              <span className="flex-1 text-sm">Vos</span>
              <span className={`num w-24 pr-2 text-right text-sm font-semibold ${mine < 0 ? "text-exp" : ""}`}>{money(Math.max(mine, 0))}</span>
              <span className="w-7" />
            </li>
          )}
          {value.map((p, i) => (
            <li key={`${i}-${version}`} className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bg text-sm font-semibold">{p.name[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <input
                defaultValue={fmt(p.amount)}
                inputMode="decimal"
                aria-label={`Parte de ${p.name}`}
                onChange={(e) => {
                  setCustom(true);
                  onChange(value.map((x, j) => (j === i ? { ...x, amount: parseAmount(e.target.value) } : x)));
                }}
                className="num w-24 rounded-lg border border-line bg-bg px-2 py-1.5 text-right text-sm text-fg focus:border-accent2"
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={!includeMe} onChange={(e) => setIncludeMe(!e.target.checked)} className="size-4" />
          Yo no participo (pagué por otros)
        </label>
        {value.length > 0 && custom && (
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(rebalance(value));
              setVersion((v) => v + 1);
            }}
            className="font-medium text-accent2"
          >
            Volver a partes iguales
          </button>
        )}
      </div>
      {mine < -0.005 && <p className="text-xs text-exp">Las partes suman más que el total.</p>}
      {!includeMe && mine > 0.005 && value.length > 0 && (
        <p className="text-xs text-muted">Quedan {money(mine)} sin asignar (cuentan como tu gasto).</p>
      )}
    </div>
  );
}

export const splitIsValid = (total: number, shares: SplitShare[]) =>
  shares.reduce((a, p) => a + p.amount, 0) <= total + 0.001;
