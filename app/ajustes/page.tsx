"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import type { Category, Kind } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/PageHeader";
import { MigrationNotice } from "@/components/MigrationNotice";
import Link from "next/link";
import { ChevronRight, PlusIcon, SplitIcon, TrashIcon } from "@/components/Icons";
import { AliasField } from "@/components/AliasField";

const EMOJIS = ["🛒", "🍔", "☕", "🍕", "🚌", "🚗", "⛽", "🏠", "💡", "📱", "📺", "🎮", "💊", "🏥", "📚", "🎓", "👕", "👟", "🎉", "🍻", "🎁", "✈️", "🐶", "💇", "🏋️", "💼", "💰", "🏷️", "🧩", "✨"];

const PALETTE = ["#34d399", "#4ade80", "#a3e635", "#facc15", "#fb923c", "#f87171", "#fb7185", "#f472b6", "#c084fc", "#a78bfa", "#60a5fa", "#22d3ee", "#2dd4bf", "#94a3b8"];

export default function Ajustes() {
  const { email, categories, signOut, toast, saveCategory, cards } = useStore();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportCsv() {
    setBusy(true);
    const q = (cols: string) => supabase().from("transactions").select(cols).order("occurred_on", { ascending: false });
    let res = await q("occurred_on,kind,amount,note,category_id,card_id,installment,my_share");
    if (res.error) res = await q("occurred_on,kind,amount,note,category_id");
    const { error } = res;
    const data = res.data as unknown as {
      occurred_on: string; kind: string; amount: number; note: string | null; category_id: string | null;
      card_id?: string | null; installment?: number | null; my_share?: number | null;
    }[] | null;
    setBusy(false);
    if (error || !data) return toast("No se pudo exportar");
    const name = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    // Excel en español espera ";" como separador y "," como decimal
    const rows = [
      "fecha;tipo;monto;tu_parte;categoria;nota;tarjeta;cuota",
      ...data.map((t) =>
        [
          t.occurred_on,
          t.kind === "expense" ? "gasto" : "ingreso",
          String(t.amount).replace(".", ","),
          String(t.my_share ?? t.amount).replace(".", ","),
          esc(name(t.category_id)),
          esc(t.note ?? ""),
          esc(cards.find((c) => c.id === t.card_id)?.name ?? ""),
          t.installment ?? "",
        ].join(";"),
      ),
    ];
    const url = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "gastos.csv" });
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exportados ${data.length} movimientos`);
  }

  // Instalación como app (Android/Chrome); en iPhone hay que hacerlo desde Compartir
  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [standalone, setStandalone] = useState(true);
  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  return (
    <div className="grid gap-5">
      <PageHeader title="Perfil" subtitle={email} />

      <MigrationNotice />

      <section className="glass rise rounded-3xl p-4">
        <AliasField />
      </section>

      <Link href="/dividir" className="glass press rise flex items-center gap-3 rounded-3xl px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inset">
          <SplitIcon width={20} height={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Dividir cuentas</span>
          <span className="block truncate text-xs text-muted">Quién pagó qué y quién le debe a quién</span>
        </span>
        <ChevronRight width={18} height={18} className="shrink-0 text-muted" />
      </Link>

      <section className="glass rise overflow-hidden rounded-3xl">
        {(["expense", "income"] as const).map((kind) => {
          const list = categories.filter((c) => c.kind === kind);
          return (
            <details key={kind} className="group border-line [&:not(:first-child)]:border-t">
              <summary className="press flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inset text-lg">{kind === "expense" ? "🏷️" : "💰"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Categorías de {kind === "expense" ? "gastos" : "ingresos"}</span>
                  <span className="block truncate text-xs text-muted">
                    {list.length} · {list.slice(0, 4).map((c) => c.emoji).join(" ")}
                  </span>
                </span>
                <ChevronRight width={18} height={18} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
              </summary>
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                {list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setEditing(c)}
                    className="press flex items-center gap-2 rounded-full border border-line bg-inset py-1.5 pl-2.5 pr-3.5 text-sm"
                  >
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                    {c.emoji} {c.name}
                  </button>
                ))}
                <button
                  onClick={() => setEditing({ kind, emoji: "🏷️", color: PALETTE[categories.length % PALETTE.length] })}
                  className="press flex items-center gap-1 rounded-full bg-fg px-3.5 py-1.5 text-sm font-medium text-bg"
                >
                  <PlusIcon width={14} height={14} /> Nueva
                </button>
              </div>
            </details>
          );
        })}
      </section>

      <section className="glass rise grid divide-y divide-line overflow-hidden rounded-3xl">
        <button onClick={exportCsv} disabled={busy} className="press px-5 py-4 text-left">
          <span className="font-medium">Exportar todo a CSV</span>
          <span className="block text-xs text-muted">Para abrir en Excel o Google Sheets</span>
        </button>
        <button onClick={signOut} className="press px-5 py-4 text-left font-medium text-exp">
          Cerrar sesión
        </button>
      </section>

      {!standalone && (
        <section className="glass rise rounded-3xl p-5">
          <h2 className="font-medium">Instalala como app</h2>
          {installEvt ? (
            <button
              onClick={() => installEvt.prompt()}
              className="press mt-3 w-full rounded-2xl bg-accent py-3 font-semibold text-accent-ink"
            >
              Instalar
            </button>
          ) : (
            <p className="mt-1 text-sm text-muted">
              iPhone: Compartir → “Agregar a inicio”. Android: menú ⋮ → “Instalar app”.
            </p>
          )}
        </section>
      )}

      {editing && (
        <CategoryForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            await saveCategory(c);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<Category>;
  onClose: () => void;
  onSave: (c: Partial<Category> & Pick<Category, "kind" | "name">) => Promise<void>;
}) {
  const { deleteCategory } = useStore();
  const kind = (initial.kind ?? "expense") as Kind;
  const [name, setName] = useState(initial.name ?? "");
  const [emoji, setEmoji] = useState(initial.emoji ?? "🏷️");
  const [color, setColor] = useState(initial.color ?? PALETTE[0]);
  const field = "w-full rounded-xl border border-line bg-inset px-4 py-3 text-fg outline-none placeholder:text-muted/70 focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title={initial.id ? "Editar categoría" : "Nueva categoría"}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim()) await onSave({ ...initial, kind, name, emoji, color });
        }}
      >
        <div className="grid grid-cols-[72px_1fr] gap-3">
          <div className="grid place-items-center rounded-xl border border-line text-3xl" style={{ background: `color-mix(in srgb, ${color} 25%, transparent)` }} aria-hidden>
            {emoji}
          </div>
          <input className={field} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" maxLength={24} />
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setEmoji(e)}
              aria-label={e}
              className={`press grid aspect-square place-items-center rounded-xl text-xl ${emoji === e ? "bg-fg/15 ring-2 ring-accent2" : "bg-surface"}`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className={`size-9 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {initial.id && (
            <button
              type="button"
              onClick={async () => {
                if (confirm("¿Borrar categoría? Sus movimientos quedan como “Sin categoría”.")) {
                  await deleteCategory(initial.id!);
                  onClose();
                }
              }}
              aria-label="Borrar"
              className="press grid size-[3.25rem] shrink-0 place-items-center rounded-2xl bg-inset text-exp"
            >
              <TrashIcon width={20} height={20} />
            </button>
          )}
          <button disabled={!name.trim()} className="press flex-1 rounded-2xl bg-accent py-3.5 font-semibold text-accent-ink disabled:opacity-40">
            Guardar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
