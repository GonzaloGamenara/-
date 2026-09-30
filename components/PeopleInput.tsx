"use client";

import { useState } from "react";
import { XIcon } from "./Icons";

/** Escribir nombres (distintos cada vez) con sugerencias de los usados antes. */
export function PeopleInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Escribí un nombre y tocá Sumar",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [name, setName] = useState("");
  const add = (raw: string) => {
    const n = raw.trim();
    setName("");
    if (!n || value.some((v) => v.toLowerCase() === n.toLowerCase())) return;
    onChange([...value, n]);
  };
  const rest = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((n) => (
            <span key={n} className="flex items-center gap-1 rounded-full bg-fg py-1 pl-3 pr-1.5 text-sm font-medium text-bg">
              {n}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== n))} aria-label={`Quitar a ${n}`} className="grid size-5 place-items-center rounded-full">
                <XIcon width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add(name))}
          placeholder={placeholder}
          aria-label="Nombre"
          autoComplete="off"
          autoCorrect="off"
          name="persona-cuenta"
          maxLength={30}
          enterKeyHint="done"
          className="min-w-0 flex-1 rounded-xl border border-line bg-inset px-3 py-2.5 text-fg placeholder:text-muted/70 focus:border-accent2"
        />
        <button type="button" onClick={() => add(name)} disabled={!name.trim()} className="press shrink-0 rounded-xl bg-fg px-4 text-sm font-semibold text-bg disabled:opacity-30">
          Sumar
        </button>
      </div>
      {rest.length > 0 && (
        <div className="hide-scroll -mx-5 flex gap-1.5 overflow-x-auto px-5">
          {rest.map((n) => (
            <button key={n} type="button" onClick={() => add(n)} className="press shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium">
              + {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
