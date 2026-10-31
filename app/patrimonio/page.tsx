"use client";

import Link from "next/link";
import { useState } from "react";
import { compact, currentMonth, money, moneyRound, monthLabelCompact } from "@/lib/format";
import { KIND_EMOJI, usePatrimonio, type ValuedAsset } from "@/lib/patrimonio";
import type { Asset, AssetSnapshot } from "@/lib/types";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EyeToggle } from "@/components/EyeToggle";
import { AssetForm } from "@/components/AssetForm";
import { StackBar } from "@/components/charts";
import { ArrowUpRight, ChevronRight, PlusIcon } from "@/components/Icons";

/** "hace 5 min", "hace 3 días" */
function ago(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export default function Patrimonio() {
  const { hideAmounts } = useStore();
  const p = usePatrimonio();
  const [editing, setEditing] = useState<Partial<Asset> | null>(null);

  const cuentas = p.rows.filter((r) => r.asset.kind === "cuenta");
  const inversiones = p.rows.filter((r) => r.asset.kind !== "cuenta");
  const prev = [...p.snapshots].reverse().find((s) => s.period < currentMonth());
  const delta = prev && prev.total ? (p.total - prev.total) / Math.abs(prev.total) : null;
  const usd = p.prices.mep ? p.net / p.prices.mep : null;
  const anyCedear = p.rows.some((r) => r.asset.kind === "cedear");
  const anyStale = p.rows.some((r) => r.asset.kind === "cedear" && !r.live);

  const open = (r: ValuedAsset) =>
    // Un fondo con TNA se edita desde su valor estimado de hoy, así guardar no pierde lo que rindió
    setEditing(r.accrued ? { ...r.asset, balance: Number(r.asset.balance ?? 0) + r.accrued } : r.asset);

  return (
    <div className="grid gap-4">
      <PageHeader title="Patrimonio" subtitle="Cuentas e inversiones" right={<EyeToggle />} />

      {p.missing ? (
        <div className="glass rounded-3xl border-l-4 border-l-exp p-4 text-sm">
          <b>Falta un paso en Supabase.</b>
          <p className="mt-1 text-muted">
            Corré el archivo <code className="text-fg">supabase/migrations/005_patrimonio.sql</code> en Supabase → SQL Editor → Run, y recargá la
            app.
          </p>
        </div>
      ) : p.loading ? (
        <div className="grid gap-4">
          <div className="skeleton h-48" />
          <div className="skeleton h-64" />
        </div>
      ) : !p.assets.length ? (
        <section className="glass rise grid gap-3 rounded-3xl p-6 text-center">
          <span className="text-4xl">🏦</span>
          <h2 className="text-lg font-semibold">Todo lo que tenés, en un solo lugar</h2>
          <p className="text-sm text-muted">
            Cargá tus cuentas y tus inversiones una vez. Los precios de los CEDEARs se actualizan solos, y cada mes queda guardada la foto para ver
            cómo evoluciona.
          </p>
          <button onClick={() => setEditing({ kind: "cuenta" })} className="press mt-2 rounded-2xl bg-fg py-3.5 font-semibold text-bg">
            Agregar la primera
          </button>
          <Link href="/importar" className="text-sm text-muted underline underline-offset-4">
            o importar desde un archivo
          </Link>
        </section>
      ) : (
        <>
          <section className="glass rise relative overflow-hidden rounded-[28px] p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--inc), transparent)" }}
            />
            <p className="relative text-sm text-muted">{p.cardDebt > 0 ? "Tenés, descontando las tarjetas" : "Tenés en total"}</p>
            <div className="relative mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="num text-[clamp(2.25rem,11vw,3.25rem)] font-semibold leading-none">{moneyRound(p.net)}</span>
              {delta !== null && Math.abs(delta) >= 0.001 && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold ${delta < 0 ? "bg-exp/15 text-exp" : "bg-inc/15 text-inc"}`}
                  title={`Comparado con el cierre de ${monthLabelCompact(prev!.period)}`}
                >
                  <ArrowUpRight width={12} height={12} className={delta < 0 ? "rotate-90" : ""} />
                  {Math.abs(Math.round(delta * 1000) / 10)}% vs {monthLabelCompact(prev!.period).toLowerCase()}
                </span>
              )}
            </div>
            {usd !== null && (
              <p className="relative mt-1.5 text-sm text-muted">
                ≈ <span className="num font-medium text-fg">{hideAmounts ? "US$ ••••" : `US$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(usd)}`}</span>{" "}
                · MEP <span className="num">{money(p.prices.mep!)}</span>
              </p>
            )}

            <div className="relative mt-5 grid gap-2.5">
              <StackBar
                parts={[
                  { key: "cash", value: Math.max(0, p.cash), color: "var(--accent-2)" },
                  { key: "inv", value: Math.max(0, p.invested), color: "var(--inc)" },
                ]}
              />
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Legend color="var(--accent-2)" label="En cuentas" value={p.cash} />
                <Legend color="var(--inc)" label="Invertido" value={p.invested} />
                {p.cardDebt > 0 && <Legend color="var(--exp)" label="Tarjetas por pagar" value={-p.cardDebt} />}
              </ul>
            </div>

            {p.snapshots.length >= 2 && <Evolution snapshots={p.snapshots} />}
          </section>

          <Group title="Cuentas" total={p.cash} rows={cuentas} onOpen={open} />
          <Group title="Inversiones" total={p.invested} rows={inversiones} onOpen={open} />

          {p.cardDebt > 0 && (
            <Link href="/fijos" className="glass press rise flex items-center gap-3 rounded-3xl px-4 py-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inset text-lg">💳</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Tarjetas por pagar</span>
                <span className="block truncate text-xs text-muted">Compras y cuotas que todavía no se debitaron</span>
              </span>
              <span className="num shrink-0 font-semibold text-exp">−{money(p.cardDebt)}</span>
              <ChevronRight width={18} height={18} className="shrink-0 text-muted" />
            </Link>
          )}

          <button
            onClick={() => setEditing({ kind: "cuenta" })}
            className="press flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3.5 text-sm font-semibold text-muted"
          >
            <PlusIcon width={16} height={16} /> Agregar cuenta o inversión
          </button>

          {anyCedear && (
            <p className="text-center text-xs text-muted">
              {anyStale ? "Algunas cotizaciones no llegaron: se usa el último precio guardado. " : ""}
              Precios {ago(p.prices.at)} ·{" "}
              <button onClick={p.refreshPrices} disabled={p.refreshing} className="font-semibold text-fg underline underline-offset-4 disabled:opacity-50">
                {p.refreshing ? "Actualizando…" : "Actualizar"}
              </button>
            </p>
          )}
        </>
      )}

      {p.error && <p className="rounded-2xl bg-exp/10 px-3 py-2 text-sm text-exp">{p.error}</p>}

      {editing && (
        <AssetForm
          initial={editing}
          livePrice={editing.ticker ? (p.prices.quotes[editing.ticker.toUpperCase()]?.price ?? null) : null}
          onClose={() => setEditing(null)}
          onSave={p.save}
          onDelete={editing.id ? () => p.remove(editing.id!) : undefined}
        />
      )}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-muted">{label}</span>
      <span className="num ml-auto font-semibold">{compact(value)}</span>
    </li>
  );
}

function Group({ title, total, rows, onOpen }: { title: string; total: number; rows: ValuedAsset[]; onOpen: (r: ValuedAsset) => void }) {
  if (!rows.length) return null;
  return (
    <section className="glass rise rounded-3xl p-2">
      <div className="flex items-baseline justify-between px-2 pb-1 pt-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="num text-sm text-muted">{money(total)}</span>
      </div>
      <ul className="grid">
        {rows.map((r) => (
          <li key={r.asset.id}>
            <Row r={r} onOpen={() => onOpen(r)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ r, onOpen }: { r: ValuedAsset; onOpen: () => void }) {
  const a = r.asset;
  const qty = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(Number(a.quantity ?? 0));
  const sub =
    a.kind === "cedear"
      ? `${a.ticker} · ${qty} × ${r.price != null ? money(r.price) : "sin precio"}`
      : a.currency === "USD"
        ? `US$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(a.balance ?? 0))}`
        : r.accrued
          ? `+${money(r.accrued)} estimado (${a.rate}% anual)`
          : `actualizado ${ago(a.updated_at)}`;
  return (
    <button onClick={onOpen} className="press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-surface">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-inset text-xl">{KIND_EMOJI[a.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">
          {a.name}
          {a.broker && <span className="font-normal text-muted"> · {a.broker}</span>}
        </span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`num block text-[15px] font-semibold ${(r.value ?? 0) < 0 ? "text-exp" : ""}`}>{r.value == null ? "—" : money(r.value)}</span>
        {r.change != null && (
          <span className={`num text-[11px] font-semibold ${r.change < 0 ? "text-exp" : "text-inc"}`}>
            {r.change > 0 ? "+" : ""}
            {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(r.change)}% hoy
          </span>
        )}
        {a.kind === "cedear" && !r.live && r.price != null && <span className="block text-[11px] text-muted">precio {ago(a.price_at)}</span>}
      </span>
    </button>
  );
}

/** Evolución mensual del total (línea simple en SVG) */
function Evolution({ snapshots }: { snapshots: AssetSnapshot[] }) {
  const pts = snapshots.slice(-12);
  const vals = pts.map((s) => s.total);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || Math.abs(max) || 1;
  const W = 300;
  const H = 64;
  const xy = pts.map((s, i) => [pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W, H - 6 - ((s.total - min) / span) * (H - 16)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <div className="relative mt-5" data-monto>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full overflow-visible" preserveAspectRatio="none">
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--inc)" opacity="0.12" />
        <path d={line} fill="none" stroke="var(--inc)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{monthLabelCompact(pts[0].period)}</span>
        <span>{monthLabelCompact(pts[pts.length - 1].period)}</span>
      </div>
    </div>
  );
}
