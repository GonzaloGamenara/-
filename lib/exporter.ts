/**
 * Exportación de datos pensada para un agente de IA (Markdown con contexto + JSON exacto)
 * y para planillas (CSV). Todo se arma en el navegador a partir de Supabase.
 */
import { supabase } from "./supabase";
import { txColumns } from "./store";
import { addMonths, currentMonth, monthEnd, monthStart } from "./format";
import { installmentAmounts, nextPaymentPeriod, remaining } from "./cards";
import { groupBalances, type SharedExpense, type SharedGroup, type SharedMember, type SharedPayment } from "./shared";
import { mine, type Card, type Category, type Purchase, type Recurring, type Split, type Transaction } from "./types";

export type Range = "month" | "3m" | "12m" | "all";

export const RANGE_LABEL: Record<Range, string> = {
  month: "Este mes",
  "3m": "3 meses",
  "12m": "12 meses",
  all: "Todo",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function fromDate(range: Range) {
  const m = currentMonth();
  if (range === "month") return monthStart(m);
  if (range === "3m") return monthStart(addMonths(m, -2));
  if (range === "12m") return monthStart(addMonths(m, -11));
  return "1900-01-01";
}

async function all<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return !error && Array.isArray(data) ? (data as T[]) : [];
}

/** Arma el dataset completo del período. */
export async function buildDataset(range: Range, alias: string) {
  const db = supabase();
  const from = fromDate(range);
  // Hasta fin del mes actual: lo posterior (cuotas futuras) va en "tarjetas → comprometido"
  const to = monthEnd(currentMonth());
  let txs = await all<Transaction>(db.from("transactions").select(txColumns).gte("occurred_on", from).lte("occurred_on", to).order("occurred_on"));
  if (!txs.length) {
    // Base sin migraciones nuevas: columnas básicas
    txs = await all<Transaction>(
      db.from("transactions").select("id,kind,amount,category_id,note,occurred_on,recurring_id,period").gte("occurred_on", from).lte("occurred_on", to).order("occurred_on"),
    );
  }
  const [categories, recurring, cards, purchases, splits, groups, members, sExpenses, sPayments] = await Promise.all([
    all<Category>(db.from("categories").select("id,name,emoji,kind")),
    all<Recurring>(db.from("recurring").select("*")),
    all<Card>(db.from("cards").select("id,name,color,due_day")),
    all<Purchase>(db.from("purchases").select("*")),
    all<Split>(db.from("splits").select("*")),
    all<SharedGroup>(db.from("shared_groups").select("*")),
    all<SharedMember>(db.from("shared_members").select("*")),
    all<SharedExpense>(db.from("shared_expenses").select("*")),
    all<SharedPayment>(db.from("shared_payments").select("*")),
  ]);

  const num = (v: unknown) => Number(v);
  const catName = (id: string | null | undefined) => categories.find((c) => c.id === id)?.name ?? "Sin categoría";
  const cardName = (id: string | null | undefined) => cards.find((c) => c.id === id)?.name ?? null;
  const purchaseOf = (id: string | null | undefined) => purchases.find((p) => p.id === id);
  const groupOfTx = (id: string) => groups.find((g) => g.transaction_id === id);

  const movements = txs.map((t) => {
    const amount = num(t.amount);
    const share = t.my_share == null ? null : num(t.my_share);
    const p = purchaseOf(t.purchase_id);
    const g = groupOfTx(t.id);
    const source = g
      ? "cuenta_compartida"
      : t.recurring_id
        ? t.card_id
          ? "suscripcion_tarjeta"
          : "fijo"
        : t.purchase_id
          ? p && p.installments > 1
            ? "cuota_tarjeta"
            : "compra_tarjeta"
          : share != null
            ? "gasto_dividido"
            : "manual";
    return {
      fecha: t.occurred_on,
      tipo: t.kind === "expense" ? "gasto" : "ingreso",
      monto_pagado: amount,
      monto_propio: share ?? amount,
      categoria: catName(t.category_id),
      detalle: t.note ?? "",
      origen: source,
      tarjeta: cardName(t.card_id),
      cuota: t.installment && p ? `${t.installment}/${p.installments}` : null,
    };
  });

  // Resumen por mes (usa el monto propio: si un gasto está dividido, cuenta solo tu parte)
  const months = [...new Set(txs.map((t) => t.occurred_on.slice(0, 7)))].sort();
  const monthly = months.map((m) => {
    const inMonth = txs.filter((t) => t.occurred_on.startsWith(m));
    const exp = inMonth.filter((t) => t.kind === "expense");
    const inc = inMonth.filter((t) => t.kind === "income");
    const byCat: Record<string, number> = {};
    for (const t of exp) byCat[catName(t.category_id)] = r2((byCat[catName(t.category_id)] ?? 0) + mine({ amount: num(t.amount), my_share: t.my_share == null ? null : num(t.my_share) }));
    const spent = r2(Object.values(byCat).reduce((a, b) => a + b, 0));
    const earned = r2(inc.reduce((a, t) => a + num(t.amount), 0));
    return {
      mes: m,
      ingresos: earned,
      gastos: spent,
      balance: r2(earned - spent),
      tasa_ahorro: earned > 0 ? r2((earned - spent) / earned) : null,
      gastos_fijos: r2(exp.filter((t) => t.recurring_id).reduce((a, t) => a + num(t.amount), 0)),
      gastos_con_tarjeta: r2(exp.filter((t) => t.card_id).reduce((a, t) => a + mine({ amount: num(t.amount), my_share: t.my_share == null ? null : num(t.my_share) }), 0)),
      por_categoria: Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1] - a[1])),
    };
  });

  const fixed = recurring.map((r) => ({
    nombre: r.name,
    tipo: r.kind === "expense" ? "gasto" : "ingreso",
    monto_mensual: num(r.amount),
    dia: r.day,
    categoria: catName(r.category_id),
    tarjeta: cardName(r.card_id),
    activo: r.active,
  }));

  const cm = currentMonth();
  const cardInfo = cards.map((c) => {
    const plans = purchases
      .filter((p) => p.card_id === c.id && p.installments > 1)
      .map((p) => {
        const left = remaining({ ...p, total_amount: num(p.total_amount) }, cm);
        return {
          compra: p.description,
          categoria: catName(p.category_id),
          total: num(p.total_amount),
          cuotas: p.installments,
          valor_cuota: installmentAmounts(num(p.total_amount), p.installments)[0],
          cuotas_restantes: left.count,
          monto_restante: left.total,
        };
      })
      .filter((p) => p.cuotas_restantes > 0);
    return {
      tarjeta: c.name,
      dia_de_pago: c.due_day,
      proximo_resumen: nextPaymentPeriod(c),
      suscripciones: recurring.filter((r) => r.card_id === c.id && r.active).map((r) => ({ nombre: r.name, monto: num(r.amount) })),
      planes_en_cuotas: plans,
      comprometido_en_cuotas: r2(plans.reduce((a, p) => a + p.monto_restante, 0)),
    };
  });

  const debts = [
    ...splits.filter((s) => !s.settled_on).map((s) => ({ persona: s.name, te_debe: num(s.amount), por: purchaseOf(s.purchase_id)?.description ?? "gasto dividido" })),
  ];
  const shared = groups.map((g) => {
    const ms = members.filter((m) => m.group_id === g.id);
    const me = ms.find((m) => m.is_me);
    const b = groupBalances(
      ms,
      sExpenses.filter((e) => e.group_id === g.id).map((e) => ({ ...e, amount: num(e.amount) })),
      sPayments.filter((p) => p.group_id === g.id).map((p) => ({ ...p, amount: num(p.amount) })),
    );
    const nm = (id: string) => (ms.find((m) => m.id === id)?.is_me ? "Yo" : (ms.find((m) => m.id === id)?.name ?? "?"));
    return {
      cuenta: g.name,
      fecha: g.occurred_on,
      total: b.total,
      mi_parte: me ? r2(b.consumed.get(me.id) ?? 0) : 0,
      mi_saldo: me ? r2(b.net.get(me.id) ?? 0) : 0,
      pendiente: b.transfers.map((t) => ({ de: nm(t.from), a: nm(t.to), monto: t.amount })),
    };
  });

  return {
    formato: "gastos-app/v1",
    generado: new Date().toISOString(),
    moneda: "ARS",
    periodo: { desde: from === "1900-01-01" ? months[0] ? `${months[0]}-01` : to : from, hasta: to },
    alias_para_cobrar: alias || null,
    definiciones: {
      monto_pagado: "Lo que salió de tu bolsillo o tarjeta en ese movimiento.",
      monto_propio: "Lo que realmente te corresponde (si el gasto fue dividido, solo tu parte). Usar este para analizar tus gastos.",
      origen:
        "manual = cargado a mano; fijo = gasto/ingreso mensual automático; suscripcion_tarjeta = fijo cobrado en tarjeta; compra_tarjeta = compra en 1 pago con tarjeta; cuota_tarjeta = una cuota de una compra en cuotas; gasto_dividido = gasto que pagaste y dividiste (monto_propio es tu parte); cuenta_compartida = tu parte de una cuenta dividida con otras personas.",
      fechas_tarjeta: "Las compras con tarjeta figuran en la fecha de pago del resumen en que caen, no en la fecha de compra.",
      periodo: "Los movimientos llegan hasta fin del mes actual; las cuotas de meses siguientes están en tarjetas.planes_en_cuotas (comprometido).",
    },
    resumen_mensual: monthly,
    fijos: fixed,
    tarjetas: cardInfo,
    cuentas_compartidas: shared,
    te_deben_por_divisiones: debts,
    movimientos: movements,
  };
}

export type Dataset = Awaited<ReturnType<typeof buildDataset>>;

const $ = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n).replace(/ /g, " ");

/** Markdown con contexto para que un agente entienda tus finanzas de un vistazo. */
export function toMarkdown(d: Dataset) {
  const L: string[] = [];
  L.push(`# Mis finanzas personales (${d.periodo.desde} a ${d.periodo.hasta})`);
  L.push("");
  L.push(`Exportado desde mi app de gastos el ${d.generado.slice(0, 10)}. Moneda: pesos argentinos (ARS).`);
  L.push("");
  L.push("## Cómo leer estos datos");
  for (const [k, v] of Object.entries(d.definiciones)) L.push(`- **${k}**: ${v}`);
  L.push("");

  L.push("## Resumen por mes");
  L.push("| Mes | Ingresos | Gastos | Balance | Ahorro | Fijos | Con tarjeta |");
  L.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const m of d.resumen_mensual)
    L.push(`| ${m.mes} | ${$(m.ingresos)} | ${$(m.gastos)} | ${$(m.balance)} | ${m.tasa_ahorro == null ? "–" : Math.round(m.tasa_ahorro * 100) + "%"} | ${$(m.gastos_fijos)} | ${$(m.gastos_con_tarjeta)} |`);
  L.push("");

  for (const m of d.resumen_mensual.slice(-3)) {
    L.push(`### Gastos por categoría · ${m.mes}`);
    for (const [c, v] of Object.entries(m.por_categoria)) L.push(`- ${c}: ${$(v)} (${m.gastos ? Math.round((v / m.gastos) * 100) : 0}%)`);
    L.push("");
  }

  if (d.fijos.length) {
    L.push("## Ingresos y gastos fijos mensuales");
    L.push("| Nombre | Tipo | Monto | Día | Categoría | Tarjeta | Activo |");
    L.push("|---|---|---:|---:|---|---|---|");
    for (const f of d.fijos) L.push(`| ${f.nombre} | ${f.tipo} | ${$(f.monto_mensual)} | ${f.dia} | ${f.categoria} | ${f.tarjeta ?? "–"} | ${f.activo ? "sí" : "no"} |`);
    L.push("");
  }

  if (d.tarjetas.length) {
    L.push("## Tarjetas");
    for (const c of d.tarjetas) {
      L.push(`### ${c.tarjeta} (paga el día ${c.dia_de_pago})`);
      L.push(`- Comprometido en cuotas: ${$(c.comprometido_en_cuotas)}`);
      for (const s of c.suscripciones) L.push(`- Suscripción: ${s.nombre} · ${$(s.monto)}/mes`);
      for (const p of c.planes_en_cuotas)
        L.push(`- ${p.compra} (${p.categoria}): ${p.cuotas} cuotas de ${$(p.valor_cuota)} · quedan ${p.cuotas_restantes} (${$(p.monto_restante)})`);
      L.push("");
    }
  }

  const pend = d.cuentas_compartidas.filter((c) => c.pendiente.length);
  if (pend.length || d.te_deben_por_divisiones.length) {
    L.push("## Deudas con otras personas");
    for (const c of pend) for (const t of c.pendiente) L.push(`- ${c.cuenta}: ${t.de} → ${t.a} ${$(t.monto)}`);
    for (const x of d.te_deben_por_divisiones) L.push(`- ${x.persona} me debe ${$(x.te_debe)} (${x.por})`);
    L.push("");
  }

  L.push(`## Movimientos (${d.movimientos.length})`);
  L.push("| Fecha | Tipo | Monto propio | Pagado | Categoría | Detalle | Origen | Tarjeta | Cuota |");
  L.push("|---|---|---:|---:|---|---|---|---|---|");
  for (const t of d.movimientos)
    L.push(
      `| ${t.fecha} | ${t.tipo} | ${$(t.monto_propio)} | ${$(t.monto_pagado)} | ${t.categoria} | ${t.detalle.replace(/\|/g, "/")} | ${t.origen} | ${t.tarjeta ?? "–"} | ${t.cuota ?? "–"} |`,
    );
  L.push("");
  L.push("## Datos completos (JSON)");
  L.push("```json");
  L.push(JSON.stringify(d, null, 1));
  L.push("```");
  return L.join("\n");
}

/** CSV para Excel/Sheets en español (";" y coma decimal). */
export function toCsv(d: Dataset) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const n = (v: number) => String(v).replace(".", ",");
  const rows = [
    "fecha;tipo;monto_propio;monto_pagado;categoria;detalle;origen;tarjeta;cuota",
    ...d.movimientos.map((t) =>
      [t.fecha, t.tipo, n(t.monto_propio), n(t.monto_pagado), esc(t.categoria), esc(t.detalle), t.origen, esc(t.tarjeta ?? ""), t.cuota ?? ""].join(";"),
    ),
  ];
  return "﻿" + rows.join("\n");
}

/** Comparte el archivo (menú del celu → Claude, Drive, WhatsApp…) o lo descarga. */
export async function deliverFile(content: string, filename: string, type: string) {
  const file = new File([content], filename, { type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
