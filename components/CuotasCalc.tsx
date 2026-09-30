"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { evaluarCuotas, inflacionGuardada, traerInflacion, type InflacionOficial } from "@/lib/cuotasCalc";
import { money, monthLabel, parseAmount } from "@/lib/format";
import { Sheet } from "./Sheet";
import { MinusIcon, PlusIcon } from "./Icons";

const pct = (x: number, d = 1) => `${(x * 100).toLocaleString("es-AR", { maximumFractionDigits: d })}%`;

/** Resultado: ¿cuotas o contado? (con la inflación mensual editable). */
export function CuotasVerdict({ contado, total, cuotas }: { contado: number; total: number; cuotas: number }) {
  // Se usa sola el último dato oficial del INDEC; se puede tocar para probar otro escenario
  const [oficial, setOficial] = useState<InflacionOficial | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [inf, setInf] = useState("");
  const [editado, setEditado] = useState(false);
  useEffect(() => {
    const cached = inflacionGuardada();
    if (cached) {
      setOficial(cached);
      setInf(String(cached.valor).replace(".", ","));
    }
    traerInflacion().then((d) => {
      if (d) {
        setOficial(d);
        setEstado("ok");
        setEditado((e) => {
          if (!e) setInf(String(d.valor).replace(".", ","));
          return e;
        });
      } else setEstado(cached ? "ok" : "error");
    });
  }, []);
  const infNum = parseAmount(inf || "2,5") / 100;
  const mesOficial = oficial ? monthLabel(oficial.fecha.slice(0, 7)).toLowerCase() : "";

  const ready = contado > 0 && total > 0 && cuotas > 1;
  const r = ready ? evaluarCuotas({ contado, cuotas, valorCuota: total / cuotas, inflacion: infNum }) : null;

  return (
    <div className="grid gap-3">
      <label className="flex items-center justify-between gap-3 text-sm text-muted">
        <span>
          Inflación mensual
          <span className="block text-xs">
            {editado && oficial ? (
              <button type="button" onClick={() => (setEditado(false), setInf(String(oficial.valor).replace(".", ",")))} className="text-accent2 underline">
                Volver al dato oficial ({String(oficial.valor).replace(".", ",")}%)
              </button>
            ) : oficial ? (
              `Último dato INDEC (${mesOficial}) · se actualiza solo`
            ) : estado === "cargando" ? (
              "Buscando el último dato del INDEC…"
            ) : (
              "No pude traer el dato oficial: usando 2,5%"
            )}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <input
            value={inf}
            placeholder="2,5"
            onChange={(e) => {
              setInf(e.target.value);
              setEditado(true);
            }}
            inputMode="decimal"
            className="num w-16 rounded-xl border border-line bg-inset px-2 py-2 text-right text-fg focus:border-accent2"
          />
          %
        </span>
      </label>

      {r && (
        <div
          className={`rounded-2xl p-4 ${
            r.conviene === "cuotas" ? "bg-inc/15" : r.conviene === "contado" ? "bg-exp/15" : "bg-inset"
          }`}
        >
          <p className={`text-lg font-semibold ${r.conviene === "cuotas" ? "text-inc" : r.conviene === "contado" ? "text-exp" : ""}`}>
            {r.conviene === "cuotas" ? "Conviene en cuotas" : r.conviene === "contado" ? "Conviene de contado" : "Da prácticamente igual"}
          </p>
          <p className="mt-1 text-sm">
            {r.conviene === "cuotas" ? (
              <>
                Las {cuotas} cuotas equivalen a <b className="num">{money(Math.round(r.valorHoy))}</b> de hoy: te ahorrás{" "}
                <b className="num">{money(Math.round(r.diferencia))}</b> contra el contado.
              </>
            ) : r.conviene === "contado" ? (
              <>
                En pesos de hoy las cuotas te salen <b className="num">{money(Math.round(r.valorHoy))}</b>:{" "}
                <b className="num">{money(Math.round(-r.diferencia))}</b> más que pagar de contado.
              </>
            ) : (
              <>Las cuotas valen lo mismo que el contado en pesos de hoy.</>
            )}
          </p>
          <p className="mt-2 text-xs text-muted">
            Total en cuotas {money(Math.round(r.total))}
            {r.recargo > 0.001 ? ` (${pct(r.recargo)} de recargo)` : r.recargo < -0.001 ? ` (${pct(-r.recargo)} menos que el contado)` : " (sin interés)"}
            {r.tasaMensual !== null && Math.abs(r.tasaMensual) > 0.0005 && (
              <> · interés implícito {pct(r.tasaMensual, 2)} mensual ({pct(r.tasaAnual!, 0)} anual) vs inflación {pct(infNum)}</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** Calculadora suelta: para decidir antes de comprar. */
export function CuotasCalcSheet({ onClose }: { onClose: () => void }) {
  const { cards, openPurchase } = useStore();
  const [contadoRaw, setContadoRaw] = useState("");
  const [mode, setMode] = useState<"total" | "cuota">("total");
  const [montoRaw, setMontoRaw] = useState("");
  const [n, setN] = useState(12);

  const contado = parseAmount(contadoRaw);
  const monto = parseAmount(montoRaw);
  const total = mode === "cuota" ? monto * n : monto;
  const field = "num w-full rounded-xl border border-line bg-inset px-4 py-3 text-lg font-semibold text-fg placeholder:text-muted/60 focus:border-accent2";

  return (
    <Sheet open onClose={onClose} title="¿Me conviene en cuotas?" tall>
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-sm text-muted">
          Precio de contado (o con el descuento de pagar en efectivo)
          <input className={field} inputMode="decimal" value={contadoRaw} onChange={(e) => setContadoRaw(e.target.value)} placeholder="$ 0" />
        </label>

        <div className="grid gap-2">
          <span className="text-sm text-muted">Cantidad de cuotas</span>
          <div className="flex items-center gap-2">
            <div className="hide-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {[3, 6, 9, 12, 18, 24].map((q) => (
                <button key={q} onClick={() => setN(q)} className={`press num shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${n === q ? "bg-fg text-bg" : "bg-inset text-muted"}`}>
                  {q}
                </button>
              ))}
            </div>
            <div className="flex shrink-0 items-center rounded-full bg-inset">
              <button aria-label="Menos cuotas" onClick={() => setN((v) => Math.max(2, v - 1))} className="press grid size-8 place-items-center">
                <MinusIcon width={14} height={14} />
              </button>
              <span className="num w-7 text-center text-sm font-semibold">{n}</span>
              <button aria-label="Más cuotas" onClick={() => setN((v) => Math.min(72, v + 1))} className="press grid size-8 place-items-center">
                <PlusIcon width={14} height={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Precio en cuotas</span>
            <div className="grid grid-cols-2 rounded-full bg-inset p-0.5 text-xs font-semibold">
              {(["total", "cuota"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 ${mode === m ? "bg-bg text-fg shadow-sm" : ""}`}>
                  {m === "total" ? "Total" : "Por cuota"}
                </button>
              ))}
            </div>
          </div>
          <input className={field} inputMode="decimal" value={montoRaw} onChange={(e) => setMontoRaw(e.target.value)} placeholder={mode === "total" ? "Igual al contado si es sin interés" : "$ 0"} />
          <div className="flex gap-2 text-xs">
            <button onClick={() => (setMode("total"), setMontoRaw(contadoRaw))} disabled={!contado} className="press rounded-full bg-inset px-3 py-1 font-medium disabled:opacity-40">
              Sin interés
            </button>
            {mode === "cuota" && monto > 0 && <span className="self-center text-muted">Total {money(Math.round(total))}</span>}
          </div>
        </div>

        <CuotasVerdict contado={contado} total={total} cuotas={n} />

        {cards.length > 0 && total > 0 && (
          <button
            onClick={() => {
              onClose();
              openPurchase({ cardId: cards[0].id, prefill: { total_amount: Math.round(total * 100) / 100, installments: n } });
            }}
            className="press rounded-2xl bg-fg py-3.5 font-semibold text-bg"
          >
            La compro: cargar en {n} cuotas
          </button>
        )}
      </div>
    </Sheet>
  );
}
