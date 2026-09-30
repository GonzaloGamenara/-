"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { copyText } from "@/lib/share";
import { RANGE_LABEL, buildDataset, deliverFile, toCsv, toMarkdown, type Range } from "@/lib/exporter";

/** Exportar tus datos: para tu agente de IA (Markdown + JSON), para pegar en un chat, o CSV. */
export function ExportPanel() {
  const { alias, toast } = useStore();
  const [range, setRange] = useState<Range>("3m");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (kind: "ai" | "copy" | "csv") => {
    setBusy(kind);
    try {
      const d = await buildDataset(range, alias);
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "csv") {
        await deliverFile(toCsv(d), `gastos-${stamp}.csv`, "text/csv");
      } else if (kind === "ai") {
        await deliverFile(toMarkdown(d), `finanzas-${stamp}.md`, "text/markdown");
      } else {
        toast((await copyText(toMarkdown(d))) ? "Copiado ✓ Pegalo en tu chat con Claude" : "No se pudo copiar");
      }
    } catch (e) {
      toast("No se pudo exportar: " + ((e as Error)?.message ?? "error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="glass rise grid gap-4 rounded-3xl p-4">
      <div>
        <h2 className="font-semibold">Exportar tus datos</h2>
        <p className="text-xs text-muted">
          Para tu agente de Claude: un archivo con resumen por mes, fijos, tarjetas, deudas y cada movimiento, más los datos completos en JSON.
        </p>
      </div>
      <div className="grid grid-cols-4 rounded-full bg-inset p-1 text-xs font-semibold">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`rounded-full py-1.5 ${range === r ? "bg-bg text-fg shadow-sm" : "text-muted"}`}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <button onClick={() => run("ai")} disabled={!!busy} className="press rounded-2xl bg-fg py-3.5 font-semibold text-bg disabled:opacity-50">
        {busy === "ai" ? "Armando…" : "Archivo para Claude (.md)"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => run("copy")} disabled={!!busy} className="press rounded-2xl bg-inset py-3 text-sm font-semibold disabled:opacity-50">
          {busy === "copy" ? "Copiando…" : "Copiar para pegar"}
        </button>
        <button onClick={() => run("csv")} disabled={!!busy} className="press rounded-2xl bg-inset py-3 text-sm font-semibold disabled:opacity-50">
          {busy === "csv" ? "Armando…" : "CSV (Excel)"}
        </button>
      </div>
    </section>
  );
}
