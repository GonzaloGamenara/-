"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { Category, Kind } from "@/lib/types";
import { Sheet } from "@/components/Sheet";
import { PageHeader } from "@/components/PageHeader";
import { MigrationNotice } from "@/components/MigrationNotice";
import Link from "next/link";
import { ChevronRight, PlusIcon, SplitIcon, TrashIcon } from "@/components/Icons";
import { AliasField } from "@/components/AliasField";
import { CategoryForm, CATEGORY_COLORS as PALETTE } from "@/components/CategoryForm";
import { ExportPanel } from "@/components/ExportPanel";
import { EyeToggle } from "@/components/EyeToggle";



export default function Ajustes() {
  const { email, categories, signOut, saveCategory, hideAmounts } = useStore();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);


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
      <PageHeader title="Perfil" subtitle={hideAmounts ? "•••••@•••" : email} right={<EyeToggle />} />

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

      <ExportPanel />

      <section className="glass rise grid divide-y divide-line overflow-hidden rounded-3xl">
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
            if (await saveCategory(c)) setEditing(null);
          }}
        />
      )}
    </div>
  );
}
