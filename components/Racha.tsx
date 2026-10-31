"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useRacha } from "@/lib/rachaStore";
import { calendarWeeks } from "@/lib/racha";
import { todayISO } from "@/lib/format";
import { Sheet } from "./Sheet";
import { Fueguito, type FuegoState } from "./Fueguito";

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Racha de Inicio: el fueguito, los días seguidos y, si hace falta, "Hoy no gasté" */
export function RachaBar() {
  const { sheet, purchaseSheet } = useStore();
  const { ready, missing, streak, days, celebrate, consumeCelebration, markNoSpend } = useRacha();
  const [igniting, setIgniting] = useState(false);
  const [open, setOpen] = useState(false);

  // El festejo espera a que cierres la carga: así lo ves
  useEffect(() => {
    if (!celebrate || sheet.open || purchaseSheet.open) return;
    setIgniting(true);
    const t = setTimeout(() => {
      setIgniting(false);
      consumeCelebration();
    }, 1200);
    return () => clearTimeout(t);
  }, [celebrate, sheet.open, purchaseSheet.open, consumeCelebration]);

  if (!ready || missing) return null;
  const state: FuegoState = igniting ? "encender" : streak.status;
  const { current, best, status, total } = streak;
  const sub =
    status === "activa"
      ? days.get(todayISO()) === "sin_gastos"
        ? "Hoy: día sin gastos ✓"
        : "Hoy ya sumaste ✓"
      : status === "riesgo"
        ? "Cargá algo hoy para no perderla"
        : total === 0
          ? "Cargá un gasto para empezar"
          : `Se cortó · tu récord: ${dias(best)}`;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(true))}
        className="glass press rise flex cursor-pointer items-center gap-3 rounded-3xl py-2 pl-3 pr-2"
        aria-label={`Racha: ${dias(current)} seguidos. ${sub}`}
      >
        <Fueguito state={state} size={30} compact />
        <span className="min-w-0 flex-1">
          <span className={`block font-semibold leading-tight ${igniting ? "pop" : ""}`}>
            {status === "apagado" ? "Sin racha" : current === 1 ? "1 día de racha" : `${current} días seguidos`}
          </span>
          <span className={`block truncate text-xs ${status === "riesgo" ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted"}`}>{sub}</span>
        </span>
        {!streak.todayDone && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              markNoSpend();
            }}
            className="press shrink-0 rounded-full bg-inset px-3 py-2 text-xs font-semibold"
          >
            Hoy no gasté
          </button>
        )}
      </div>
      {open && <RachaSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Detalle: calendario de las últimas semanas, récord y reglas */
function RachaSheet({ onClose }: { onClose: () => void }) {
  const { streak, days, markNoSpend } = useRacha();
  const today = todayISO();
  const weeks = calendarWeeks(today, 6);
  const { current, best, status, total, todayDone } = streak;

  return (
    <Sheet open onClose={onClose} title="Tu racha">
      <div className="grid gap-5">
        <div className="grid justify-items-center gap-1 text-center">
          <Fueguito state={status} size={88} />
          <p className="num text-3xl font-semibold">{status === "apagado" ? "0" : current}</p>
          <p className="text-sm text-muted">{status === "apagado" ? "días seguidos" : `${current === 1 ? "día seguido" : "días seguidos"} cargando`}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-inset py-2.5">
            <div className="num text-lg font-semibold">{dias(best)}</div>
            <div className="text-[11px] text-muted">tu récord</div>
          </div>
          <div className="rounded-2xl bg-inset py-2.5">
            <div className="num text-lg font-semibold">{dias(total)}</div>
            <div className="text-[11px] text-muted">con carga en total</div>
          </div>
        </div>

        <div className="grid gap-1.5">
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w[0]} className="grid grid-cols-7 gap-1.5">
              {w.map((d) => {
                const kind = days.get(d);
                const future = d > today;
                return (
                  <span
                    key={d}
                    title={kind === "sin_gastos" ? "Sin gastos" : kind ? "Cargaste" : undefined}
                    className={`num grid aspect-square place-items-center rounded-full text-[11px] font-semibold ${
                      kind === "carga"
                        ? "text-white"
                        : kind === "sin_gastos"
                          ? "border-2 border-[#ff8a1f] text-[#ff8a1f]"
                          : future
                            ? "text-muted/40"
                            : "bg-inset text-muted"
                    } ${d === today ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
                    style={kind === "carga" ? { background: "linear-gradient(160deg, #ffb02e, #ff3d2e)" } : undefined}
                  >
                    {Number(d.slice(8, 10))}
                  </span>
                );
              })}
            </div>
          ))}
          <div className="mt-1 flex justify-center gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: "linear-gradient(160deg, #ffb02e, #ff3d2e)" }} /> Cargaste
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border-2 border-[#ff8a1f]" /> Sin gastos
            </span>
          </div>
        </div>

        <p className="text-sm text-muted">
          Suma un día cada vez que cargás algo a mano. Los fijos automáticos y lo importado desde archivos no cuentan. ¿Un día no gastaste nada?
          Marcalo y la racha sigue.
        </p>

        {!todayDone && (
          <button
            onClick={async () => {
              await markNoSpend();
              onClose();
            }}
            className="press rounded-2xl bg-fg py-3.5 font-semibold text-bg"
          >
            Hoy no gasté nada
          </button>
        )}
      </div>
    </Sheet>
  );
}
