"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore, txColumns } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { dayLabel, money, uid } from "@/lib/format";
import { CATEGORY_COLORS } from "@/components/CategoryForm";
import { ChevronLeft } from "@/components/Icons";
import {
  importRange,
  parseImport,
  planChanges,
  planImport,
  planMerges,
  type Action,
  type ImportFile,
  type PlannedChange,
  type PlannedMerge,
  type PlannedRow,
} from "@/lib/importer";
import type { Kind, Transaction } from "@/lib/types";

const FILTERS: { id: Action | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "nuevo", label: "Nuevos" },
  { id: "repetido", label: "Repetidos" },
  { id: "fijo", label: "Fijos" },
];

export default function Importar() {
  const router = useRouter();
  const { categories, recurring, needsMigration, reload, setMonth, toast } = useStore();
  const [text, setText] = useState("");
  const [file, setFile] = useState<ImportFile | null>(null);
  const [rows, setRows] = useState<PlannedRow[] | null>(null);
  const [changes, setChanges] = useState<PlannedChange[]>([]);
  const [merges, setMerges] = useState<PlannedMerge[]>([]);
  const [filter, setFilter] = useState<Action | "todos">("todos");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async (raw: string) => {
    setError(null);
    setBusy(true);
    try {
      const parsed = parseImport(raw);
      const range = importRange(parsed);
      let existing: Transaction[] = [];
      if (range) {
        const { data, error: err } = await supabase()
          .from("transactions")
          .select(needsMigration ? "id,kind,amount,category_id,note,occurred_on,recurring_id,period" : txColumns)
          .gte("occurred_on", range.from)
          .lte("occurred_on", range.to);
        if (err) throw new Error("No pude leer lo que ya tenés cargado: " + err.message);
        existing = ((data ?? []) as unknown as Transaction[]).map((t) => ({
          ...t,
          amount: Number(t.amount),
        }));
      }
      setFile(parsed);
      setRows(planImport(parsed, existing, recurring, categories));
      setChanges(planChanges(parsed, existing, categories));
      setMerges(planMerges(parsed, categories));
      setFilter("todos");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const content = await f.text();
    setText(content);
    review(content);
  };

  const toggle = (key: number) => setRows((p) => p?.map((r) => (r.key === key ? { ...r, include: !r.include } : r)) ?? p);
  const toggleChange = (key: number) => setChanges((p) => p.map((c) => (c.key === key && c.target ? { ...c, include: !c.include } : c)));
  const toggleMerge = (key: number) =>
    setMerges((p) => p.map((m) => (m.key === key && m.from && m.to ? { ...m, include: !m.include } : m)));

  const chosen = useMemo(() => rows?.filter((r) => r.include) ?? [], [rows]);
  const chosenChanges = changes.filter((c) => c.include && c.target);
  const chosenMerges = merges.filter((m) => m.include && m.from && m.to);
  const total = chosen.length + chosenChanges.length + chosenMerges.length;
  const summary = useMemo(() => {
    const count = (a: Action) => rows?.filter((r) => r.action === a).length ?? 0;
    const sum = (k: "expense" | "income") =>
      chosen.filter((r) => r.kind === k && r.action === "nuevo").reduce((a, r) => a + (r.row.mi_parte ?? r.amount), 0);
    const newCats = [
      ...new Set(
        [...chosen.map((r) => r.newCategory), ...changes.filter((c) => c.include).map((c) => c.newCategory)].filter(
          (x): x is string => !!x,
        ),
      ),
    ];
    return {
      nuevo: count("nuevo"),
      repetido: count("repetido"),
      fijo: count("fijo"),
      gastos: sum("expense"),
      ingresos: sum("income"),
      newCats,
    };
  }, [rows, chosen, changes]);

  const visible = rows?.filter((r) => filter === "todos" || r.action === filter) ?? [];

  const run = async () => {
    if (!rows || !file || !total) return;
    setBusy(true);
    const db = supabase();
    try {
      // 1. Categorías que faltan (de movimientos nuevos o de correcciones)
      const catIds = new Map<string, string>();
      const needed = new Map<string, { kind: Kind; name: string }>();
      for (const r of chosen)
        if (r.newCategory)
          needed.set(`${r.kind}:${r.newCategory}`, {
            kind: r.kind,
            name: r.newCategory,
          });
      for (const c of chosenChanges)
        if (c.newCategory)
          needed.set(`${c.target!.kind}:${c.newCategory}`, {
            kind: c.target!.kind,
            name: c.newCategory,
          });
      if (needed.size) {
        const defs = new Map(file.categorias.map((c) => [c.nombre.trim().toLowerCase(), c]));
        const newCats = [...needed.values()].map((n, i) => {
          const def = defs.get(n.name.toLowerCase());
          return {
            id: uid(),
            kind: n.kind,
            name: n.name,
            emoji: def?.emoji || "🏷️",
            color: def?.color || CATEGORY_COLORS[(categories.length + i) % CATEGORY_COLORS.length],
            sort: categories.length + i,
          };
        });
        const { error: err } = await db.from("categories").insert(newCats);
        if (err) throw new Error("No pude crear las categorías: " + err.message);
        newCats.forEach((c) => catIds.set(`${c.kind}:${c.name}`, c.id));
      }
      const catId = (r: PlannedRow) => r.category?.id ?? (r.newCategory ? (catIds.get(`${r.kind}:${r.newCategory}`) ?? null) : null);

      // 2. Movimientos nuevos (y los repetidos que elegiste importar igual)
      const inserts = chosen
        .filter((r) => r.action !== "fijo")
        .map((r) => ({
          id: uid(),
          kind: r.kind,
          amount: r.amount,
          category_id: catId(r),
          note: r.row.nota || null,
          occurred_on: r.row.fecha,
          recurring_id: null,
          period: null,
          ...(r.row.mi_parte !== undefined && !needsMigration ? { my_share: r.row.mi_parte } : {}),
        }));
      for (let i = 0; i < inserts.length; i += 200) {
        const { error: err } = await db.from("transactions").insert(inserts.slice(i, i + 200));
        if (err) throw new Error(`Se guardaron ${i} de ${inserts.length}; falló el resto: ${err.message}`);
      }

      // 3. Fijos confirmados: monto y fecha reales
      for (const r of chosen.filter((x) => x.action === "fijo" && x.match)) {
        const { error: err } = await db.from("transactions").update({ amount: r.amount, occurred_on: r.row.fecha }).eq("id", r.match!.id);
        if (err) throw new Error(`No pude actualizar “${r.fijoName}”: ${err.message}`);
      }

      // 4. Correcciones sobre lo ya cargado
      for (const c of chosenChanges) {
        const t = c.target!;
        const { error: err } = c.change.borrar
          ? await db.from("transactions").delete().eq("id", t.id)
          : await db
              .from("transactions")
              .update({
                ...c.patch,
                ...(c.newCategory ? { category_id: catIds.get(`${t.kind}:${c.newCategory}`) } : {}),
              })
              .eq("id", t.id);
        if (err) throw new Error(`No pude corregir “${t.note ?? "un movimiento"}”: ${err.message}`);
      }

      // 5. Categorías fusionadas: todo pasa a la de destino y la vieja se borra
      for (const m of chosenMerges) {
        for (const table of needsMigration ? ["transactions", "recurring"] : ["transactions", "recurring", "purchases"]) {
          const { error: err } = await db.from(table).update({ category_id: m.to!.id }).eq("category_id", m.from!.id);
          if (err) throw new Error(`No pude pasar “${m.from!.name}” a “${m.to!.name}”: ${err.message}`);
        }
        const { error: err } = await db.from("categories").delete().eq("id", m.from!.id);
        if (err) throw new Error(`No pude borrar la categoría “${m.from!.name}”: ${err.message}`);
      }

      const dates = [...chosen.map((r) => r.row.fecha), ...chosenChanges.map((c) => c.change.fecha ?? c.target!.occurred_on)].sort();
      if (dates.length) setMonth(dates.at(-1)!.slice(0, 7));
      await reload();
      const parts = [
        inserts.length && `${inserts.length} importados`,
        chosenChanges.length + chosen.filter((r) => r.action === "fijo").length &&
          `${chosenChanges.length + chosen.filter((r) => r.action === "fijo").length} corregidos`,
        chosenMerges.length && `${chosenMerges.length} categorías unificadas`,
      ].filter(Boolean);
      toast(`Listo ✓ ${parts.join(" · ")}`);
      router.push(dates.length ? "/movimientos" : "/ajustes");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <header className="rise flex items-center gap-2 pt-1">
        <Link href="/ajustes" aria-label="Volver" className="press -ml-2 grid size-10 place-items-center rounded-full">
          <ChevronLeft width={22} height={22} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Importar movimientos</h1>
          <p className="mt-0.5 text-sm text-muted">Revisás todo antes de que se guarde</p>
        </div>
      </header>

      {!rows && (
        <section className="glass rise grid gap-4 rounded-3xl p-4">
          <p className="text-sm text-muted">
            Elegí el archivo <span className="font-medium text-fg">.json</span> con tus movimientos. La app marca los que ya tenés cargados
            para no duplicarlos y actualiza tus fijos con el monto real.
          </p>
          <label className="press grid cursor-pointer place-items-center rounded-2xl bg-fg py-3.5 font-semibold text-bg">
            {busy ? "Leyendo…" : "Elegir archivo"}
            <input
              type="file"
              accept=".json,application/json,text/plain"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          <details className="group">
            <summary className="press cursor-pointer list-none text-center text-sm text-muted [&::-webkit-details-marker]:hidden">
              o pegá el contenido
            </summary>
            <div className="mt-3 grid gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                autoComplete="off"
                spellCheck={false}
                placeholder='{"movimientos": [...]}'
                className="w-full rounded-2xl bg-inset p-3 font-mono text-xs outline-none"
              />
              <button
                onClick={() => review(text)}
                disabled={!text.trim() || busy}
                className="press rounded-2xl bg-inset py-3 text-sm font-semibold disabled:opacity-50"
              >
                Revisar
              </button>
            </div>
          </details>
          {error && <p className="rounded-2xl bg-exp/10 px-3 py-2 text-sm text-exp">{error}</p>}
        </section>
      )}

      {rows && (
        <>
          {(changes.length > 0 || merges.length > 0) && (
            <section className="glass rise grid gap-2 rounded-3xl p-4">
              <div>
                <h2 className="font-semibold">Correcciones</h2>
                <p className="text-xs text-muted">Sobre lo que ya tenés cargado. Tocá una para no aplicarla.</p>
              </div>
              <ul className="-mx-2 grid gap-1">
                {merges.map((m) => (
                  <li key={`m${m.key}`}>
                    <MergeRow m={m} onToggle={() => toggleMerge(m.key)} />
                  </li>
                ))}
                {changes.map((c) => (
                  <li key={`c${c.key}`}>
                    <ChangeRow c={c} onToggle={() => toggleChange(c.key)} />
                  </li>
                ))}
              </ul>
              {rows.length === 0 && summary.newCats.length > 0 && (
                <p className="text-xs text-muted">
                  Se crean las categorías: <span className="text-fg">{summary.newCats.join(", ")}</span>
                </p>
              )}
            </section>
          )}

          {rows.length > 0 && (
            <>
              <section className="glass rise grid gap-3 rounded-3xl p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat n={summary.nuevo} label="nuevos" />
                  <Stat n={summary.repetido} label="ya cargados" />
                  <Stat n={summary.fijo} label="fijos" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Gastos nuevos</span>
                  <span className="num font-semibold" data-monto>
                    −{money(summary.gastos)}
                  </span>
                </div>
                <div className="-mt-2 flex justify-between text-sm">
                  <span className="text-muted">Ingresos nuevos</span>
                  <span className="num font-semibold text-inc" data-monto>
                    +{money(summary.ingresos)}
                  </span>
                </div>
                {summary.newCats.length > 0 && (
                  <p className="text-xs text-muted">
                    Se crean las categorías: <span className="text-fg">{summary.newCats.join(", ")}</span>
                  </p>
                )}
                {summary.repetido > 0 && (
                  <p className="text-xs text-muted">Los que parecen ya cargados quedan destildados. Tocalos si querés importarlos igual.</p>
                )}
              </section>

              <div className="grid grid-cols-4 rounded-full bg-inset p-1 text-xs font-semibold">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-full py-1.5 ${filter === f.id ? "bg-bg text-fg shadow-sm" : "text-muted"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <ul className="grid gap-1">
                {visible.map((r) => (
                  <li key={r.key}>
                    <Row r={r} onToggle={() => toggle(r.key)} />
                  </li>
                ))}
                {!visible.length && <li className="py-6 text-center text-sm text-muted">Nada por acá</li>}
              </ul>
            </>
          )}

          {error && <p className="rounded-2xl bg-exp/10 px-3 py-2 text-sm text-exp">{error}</p>}

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 grid grid-cols-[auto_minmax(0,1fr)] gap-2 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-3 pt-6">
            <button
              onClick={() => {
                setRows(null);
                setChanges([]);
                setMerges([]);
                setError(null);
              }}
              disabled={busy}
              className="press rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={run}
              disabled={busy || !total}
              className="press rounded-2xl py-3.5 font-semibold text-accent-ink shadow-lg disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              }}
            >
              {busy ? "Guardando…" : `${rows.length ? "Importar" : "Aplicar"} ${total}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl bg-inset py-2.5">
      <div className="num text-xl font-semibold">{n}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function Row({ r, onToggle }: { r: PlannedRow; onToggle: () => void }) {
  const isExp = r.kind === "expense";
  const shown = r.row.mi_parte ?? r.amount;
  const cat = r.category;
  return (
    <button
      onClick={onToggle}
      aria-pressed={r.include}
      className={`press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-opacity hover:bg-surface ${r.include ? "" : "opacity-45"}`}
    >
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold ${
          r.include ? "border-transparent bg-accent text-accent-ink" : "border-line"
        }`}
      >
        {r.include ? "✓" : ""}
      </span>
      <span
        className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg"
        style={{
          background: `color-mix(in srgb, ${cat?.color ?? "#64748b"} 22%, transparent)`,
        }}
      >
        {cat?.emoji ?? (r.newCategory ? "✨" : "❔")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{r.row.nota || cat?.name || r.newCategory || "Sin categoría"}</span>
        <span className="block truncate text-xs text-muted">
          {cat?.name ?? (r.newCategory ? `${r.newCategory} (nueva)` : "Sin categoría")} · {dayLabel(r.row.fecha)}
        </span>
        {r.action === "repetido" && r.match && (
          <span className="mt-0.5 line-clamp-2 block text-[11px] text-amber-500">
            Ya cargado: {r.match.note || "sin nota"} · {dayLabel(r.match.occurred_on)}
          </span>
        )}
        {r.action === "fijo" && r.match && (
          <span className="mt-0.5 line-clamp-2 block text-[11px] text-accent">
            Actualiza “{r.fijoName}”: <span className="whitespace-nowrap">{money(Number(r.match.amount))}</span> →{" "}
            <span className="whitespace-nowrap">{money(r.amount)}</span>
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className={`num block text-[15px] font-semibold ${isExp ? "" : "text-inc"}`}>
          {isExp ? "−" : "+"}
          {money(shown)}
        </span>
        {shown < r.amount && <span className="num text-[11px] text-muted">de {money(r.amount)}</span>}
      </span>
    </button>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={`grid size-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold ${
        on ? "border-transparent bg-accent text-accent-ink" : "border-line"
      }`}
    >
      {on ? "✓" : ""}
    </span>
  );
}

function ChangeRow({ c, onToggle }: { c: PlannedChange; onToggle: () => void }) {
  const { categories } = useStore();
  const t = c.target;
  const del = !!c.change.borrar;
  const from = t ? categories.find((x) => x.id === t.category_id) : null;
  const edits: string[] = [];
  if (c.change.categoria) edits.push(`${from?.name ?? "Sin categoría"} → ${c.category?.name ?? `${c.newCategory} (nueva)`}`);
  if (c.patch.note !== undefined && c.patch.note !== t?.note) edits.push(`“${c.patch.note ?? ""}”`);
  if (c.patch.amount !== undefined) edits.push(money(c.patch.amount));
  if (c.patch.occurred_on) edits.push(dayLabel(c.patch.occurred_on));
  return (
    <button
      onClick={onToggle}
      disabled={!t}
      aria-pressed={c.include}
      className={`press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-opacity hover:bg-surface ${c.include ? "" : "opacity-45"}`}
    >
      <Check on={c.include} />
      <span className={`grid size-10 shrink-0 place-items-center rounded-2xl text-lg ${del ? "bg-exp/15" : "bg-inset"}`}>
        {del ? "🗑️" : "✏️"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">
          {del ? "Borrar" : "Editar"}: {t?.note || c.change.buscar.nota || from?.name || "movimiento"}
        </span>
        <span className="line-clamp-2 block text-xs text-muted">
          {dayLabel(c.change.buscar.fecha)} · <span className="num">{money(Math.abs(c.change.buscar.monto))}</span>
          {edits.length > 0 && ` · ${edits.join(" · ")}`}
        </span>
        {(c.problem || c.change.motivo) && (
          <span className={`mt-0.5 line-clamp-2 block text-[11px] ${c.problem ? "text-amber-500" : "text-muted"}`}>
            {c.problem ?? c.change.motivo}
          </span>
        )}
      </span>
    </button>
  );
}

function MergeRow({ m, onToggle }: { m: PlannedMerge; onToggle: () => void }) {
  const ok = !!m.from && !!m.to;
  return (
    <button
      onClick={onToggle}
      disabled={!ok}
      aria-pressed={m.include}
      className={`press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-opacity hover:bg-surface ${m.include ? "" : "opacity-45"}`}
    >
      <Check on={m.include} />
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inset text-lg">🔀</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">
          Unificar {m.from?.emoji} {m.merge.de} → {m.to?.emoji} {m.merge.a}
        </span>
        <span className={`block truncate text-xs ${ok ? "text-muted" : "text-amber-500"}`}>
          {ok
            ? `Todo lo de “${m.merge.de}” pasa a “${m.merge.a}” y se borra “${m.merge.de}”`
            : `No encontré la categoría “${m.from ? m.merge.a : m.merge.de}”`}
        </span>
      </span>
    </button>
  );
}
