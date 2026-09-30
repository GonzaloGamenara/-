"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useShared } from "@/lib/sharedStore";
import { todayISO } from "@/lib/format";
import { Sheet } from "./Sheet";
import { PeopleInput } from "./PeopleInput";
import { CategoryChips } from "./CategoryChips";

/** Crear una cuenta compartida: nombre, quiénes están y (opcional) categoría. */
export function NewGroupSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { recentNames } = useStore();
  const { createGroup, members } = useShared();
  const [name, setName] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const suggestions = [...new Set([...members.filter((m) => !m.is_me).map((m) => m.name), ...recentNames])].slice(0, 12);
  const valid = name.trim().length > 0 && people.length > 0;
  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title="Nueva cuenta compartida" tall>
      <div className="grid gap-5">
        <label className="grid gap-1.5 text-sm text-muted">
          ¿Qué es?
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Asado del sábado, viaje, cena…" maxLength={50} autoComplete="off" name="nombre-cuenta" />
        </label>
        <div className="grid gap-1.5">
          <span className="text-sm text-muted">¿Quiénes están, además de vos?</span>
          <PeopleInput value={people} onChange={setPeople} suggestions={suggestions} />
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm text-muted">Categoría de tu parte (para tus métricas)</span>
          <CategoryChips kind="expense" value={catId} onChange={setCatId} />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm text-muted">
          Fecha
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40 rounded-xl border border-line bg-inset px-3 py-2 text-fg" />
        </label>
        <button
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            const id = await createGroup({ name, category_id: catId, occurred_on: date, people });
            setBusy(false);
            if (id) {
              onClose();
              router.push(`/dividir/${id}`);
            }
          }}
          className="press rounded-2xl bg-accent2 py-4 font-semibold text-black disabled:opacity-35"
        >
          {busy ? "Creando…" : people.length ? `Crear cuenta (${people.length + 1} personas)` : "Sumá al menos una persona"}
        </button>
      </div>
    </Sheet>
  );
}
