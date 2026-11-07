import { addMonths, daysInMonth, dueDate, fijoDate, todayISO } from "../format";
import { buildInstallments, periodForPurchase } from "../cards";
import type { Card, Purchase } from "../types";

/**
 * Datos ficticios para /demo: una persona inventada con tres meses de movimientos, fijos, tarjetas,
 * techos, racha y patrimonio. Se arman según la fecha de hoy (el mes actual siempre tiene datos)
 * y con un azar con semilla fija (siempre salen los mismos).
 */

export type Row = Record<string, unknown>;
export type DemoDb = Record<string, Row[]>;

export const DEMO_USER = {
  id: "d3m0d3m0-0000-4000-8000-000000000001",
  email: "demo@gastos.app",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { alias: "demo.gastos", name: "Demo" },
  app_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

let n = 0;
const id = (p: string) => `d3m0${p.padEnd(4, "0").slice(0, 4)}-0000-4000-8000-${String(++n).padStart(12, "0")}`;

/** Azar reproducible (mulberry32) */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoDb(today = todayISO()): DemoDb {
  n = 0;
  const rand = rng(20261107);
  const between = (a: number, b: number, step = 100) => Math.round((a + rand() * (b - a)) / step) * step;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const M = today.slice(0, 7);
  const months = [addMonths(M, -2), addMonths(M, -1), M];
  const at = (d: string) => `${d}T15:00:00.000Z`;

  // --- categorías --------------------------------------------------------
  const cat = (name: string, emoji: string, color: string, kind: "expense" | "income") => ({ id: id("cat"), name, emoji, color, kind, sort: n, created_at: at(`${months[0]}-01`) });
  const C = {
    super: cat("Supermercado", "🛒", "#34d399", "expense"),
    afuera: cat("Comida afuera", "🍔", "#fb923c", "expense"),
    delivery: cat("Delivery", "🛵", "#f97316", "expense"),
    cafe: cat("Café y antojos", "☕", "#d6a35c", "expense"),
    transporte: cat("Transporte", "🚌", "#60a5fa", "expense"),
    vivienda: cat("Vivienda", "🏠", "#a78bfa", "expense"),
    servicios: cat("Servicios", "💡", "#facc15", "expense"),
    subs: cat("Suscripciones", "📺", "#f472b6", "expense"),
    salud: cat("Salud", "💊", "#f87171", "expense"),
    salidas: cat("Salidas", "🎉", "#fb7185", "expense"),
    ropa: cat("Ropa", "👕", "#c084fc", "expense"),
    tecno: cat("Tecnología", "💻", "#22d3ee", "expense"),
    regalos: cat("Regalos", "🎁", "#f9a8d4", "expense"),
    sueldo: cat("Sueldo", "💼", "#4ade80", "income"),
    freelance: cat("Freelance", "🧑‍💻", "#2dd4bf", "income"),
  };
  const categories = Object.values(C);

  // --- cuentas, tarjetas y fijos -----------------------------------------
  const banco = id("acct");
  const mp = id("acct");
  const visa: Card = { id: id("card"), name: "Visa", color: "#2b44c9", due_day: 10, closing_day: 28, account_id: banco };
  const master: Card = { id: id("card"), name: "Mastercard", color: "#c98a1c", due_day: 8, closing_day: 26, account_id: banco };
  const cards = [visa, master];

  const fijo = (name: string, kind: "expense" | "income", amount: number, category: { id: string }, day: number, extra: Row = {}) => ({
    id: id("rec"),
    kind,
    name,
    amount,
    category_id: category.id,
    day,
    active: true,
    card_id: null,
    account_id: banco,
    last_business_day: false,
    created_at: at(`${months[0]}-01`),
    ...extra,
  });
  const recurring = [
    fijo("Sueldo", "income", 1850000, C.sueldo, 31, { last_business_day: true }),
    fijo("Alquiler", "expense", 520000, C.vivienda, 5),
    fijo("Expensas", "expense", 96000, C.vivienda, 10),
    fijo("Internet", "expense", 32000, C.servicios, 12),
    fijo("Luz", "expense", 28500, C.servicios, 18),
    fijo("Gimnasio", "expense", 45000, C.salud, 3),
    fijo("Spotify", "expense", 6500, C.subs, visa.due_day, { card_id: visa.id, account_id: null }),
    fijo("Netflix", "expense", 13900, C.subs, visa.due_day, { card_id: visa.id, account_id: null }),
    fijo("iCloud", "expense", 2900, C.subs, master.due_day, { card_id: master.id, account_id: null }),
  ];

  const transactions: Row[] = [];
  const tx = (kind: "expense" | "income", amount: number, category: { id: string }, note: string, date: string, extra: Row = {}) => {
    const row = {
      id: id("tx"),
      kind,
      amount,
      category_id: category.id,
      note,
      occurred_on: date,
      recurring_id: null,
      period: null,
      card_id: null,
      purchase_id: null,
      installment: null,
      my_share: null,
      account_id: banco,
      created_at: at(date),
      ...extra,
    };
    transactions.push(row);
    return row;
  };

  // Fijos ya cobrados (con un aumento de Internet este mes para el radar de suscripciones)
  for (const m of months) {
    for (const r of recurring) {
      const card = cards.find((c) => c.id === r.card_id);
      const date = card ? dueDate(m, card.due_day) : fijoDate(m, r);
      if (date > today) continue;
      const amount = r.name === "Internet" && m !== M ? 28900 : (r.amount as number);
      tx(r.kind as "expense" | "income", amount, { id: r.category_id }, r.name, date, {
        recurring_id: r.id,
        period: m,
        card_id: r.card_id,
        account_id: card ? null : banco,
      });
    }
  }

  // --- compras con tarjeta -----------------------------------------------
  const purchases: Purchase[] = [];
  const compra = (card: Card, description: string, category: { id: string }, total: number, cuotas: number, date: string) => {
    if (date > today) return;
    const p: Purchase = {
      id: id("pur"),
      card_id: card.id,
      description,
      category_id: category.id,
      total_amount: total,
      installments: cuotas,
      first_period: periodForPurchase(card, date),
      from_installment: 1,
      purchased_on: date,
    };
    purchases.push(p);
    for (const t of buildInstallments(p, card, null)) transactions.push({ ...t, account_id: null, created_at: at(date) });
  };
  compra(visa, "Notebook", C.tecno, 1140000, 6, `${months[0]}-14`);
  compra(master, "Zapatillas running", C.ropa, 159000, 3, `${months[1]}-20`);
  compra(visa, "Auriculares", C.tecno, 48000, 1, `${months[1]}-06`);
  compra(master, "Farmacity", C.salud, 23500, 1, `${months[1]}-24`);
  compra(visa, "Campera", C.ropa, 89900, 1, `${months[2]}-02`);
  compra(visa, "Cena de cumpleaños", C.afuera, 62000, 1, `${months[0]}-25`);

  // --- el día a día --------------------------------------------------------
  const lugares = {
    super: ["Coto", "Carrefour Express", "Día", "Verdulería", "Chino de la esquina", "Carnicería"],
    delivery: ["PedidosYa · Sushi", "Rappi · Hamburguesas", "PedidosYa · Empanadas", "Rappi · Pizza"],
    cafe: ["Café Martínez", "Havanna", "Panadería", "Heladería"],
    transporte: ["SUBE", "Uber", "Cabify", "Nafta"],
    afuera: ["Parrilla", "Almuerzo oficina", "Pizzería", "Bodegón"],
    salidas: ["Cine", "Recital", "Bar con amigos"],
  };
  for (const m of months) {
    for (let d = 1; d <= daysInMonth(m); d++) {
      const date = `${m}-${String(d).padStart(2, "0")}`;
      if (date > today) break;
      const wd = new Date(`${date}T12:00`).getDay();
      // Hoy, solo un café: la demo arranca con "Hoy podés gastar" en positivo
      if (date === today) {
        tx("expense", 3200, C.cafe, "Café Martínez", date, { account_id: mp });
        continue;
      }
      if (rand() < 0.3) tx("expense", between(18000, 62000), C.super, pick(lugares.super), date);
      if (rand() < (wd === 5 || wd === 6 ? 0.45 : 0.12)) tx("expense", between(11000, 26000), C.delivery, pick(lugares.delivery), date, { account_id: mp });
      if (rand() < 0.4) tx("expense", between(2800, 7500, 50), C.cafe, pick(lugares.cafe), date, { account_id: mp });
      if (wd >= 1 && wd <= 5 && rand() < 0.55) tx("expense", between(1200, 6500, 50), C.transporte, pick(lugares.transporte), date);
      if (rand() < 0.12) tx("expense", between(14000, 38000), C.afuera, pick(lugares.afuera), date);
      if (wd === 6 && rand() < 0.4) tx("expense", between(15000, 42000), C.salidas, pick(lugares.salidas), date);
    }
    // Un trabajo freelance por mes
    const fd = `${m}-${String(2 + Math.floor(rand() * 5)).padStart(2, "0")}`;
    if (fd <= today) tx("income", between(220000, 420000, 1000), C.freelance, "Proyecto web", fd);
  }

  // Un asado dividido: te deben una parte
  const splits: Row[] = [];
  const asadoDate = `${months[1]}-15`;
  const asado = tx("expense", 48000, C.afuera, "Asado con amigos", asadoDate, { my_share: 16000 });
  splits.push(
    { id: id("spl"), transaction_id: asado.id, purchase_id: null, name: "Juli", amount: 16000, settled_on: null },
    { id: id("spl"), transaction_id: asado.id, purchase_id: null, name: "Tomi", amount: 16000, settled_on: `${months[1]}-18` },
  );

  // --- techos --------------------------------------------------------------
  const budgets: Row[] = [];
  const budget_categories: Row[] = [];
  const techo = (name: string, cats: { id: string }[], monthly: number, extra: Row = {}) => {
    const b = { id: id("bud"), name, monthly, weekly: null, max_per_tx: null, allowed_days: null, sort: budgets.length, ...extra };
    budgets.push(b);
    for (const c of cats) budget_categories.push({ budget_id: b.id, category_id: c.id });
  };
  techo("Supermercado", [C.super], 320000);
  techo("Delivery", [C.delivery], 90000, { weekly: 25000 });
  techo("Comida afuera", [C.afuera], 70000);
  techo("Antojos", [C.cafe], 45000);
  techo("Transporte", [C.transporte], 55000);
  techo("Gustos", [C.ropa, C.salidas], 160000);

  // --- racha ---------------------------------------------------------------
  const streak_days: Row[] = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(`${today}T12:00`);
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    streak_days.push({ day, kind: i === 6 ? "sin_gastos" : "carga" });
  }

  // --- patrimonio ----------------------------------------------------------
  const ayer = new Date(`${today}T12:00`);
  ayer.setDate(ayer.getDate() - 1);
  const anchor = ayer.toISOString();
  const now = new Date().toISOString();
  const asset = (a: Row) => ({
    ticker: null,
    quantity: null,
    balance: null,
    currency: "ARS",
    last_price: null,
    price_at: null,
    rate: null,
    broker: null,
    updated_at: anchor,
    balance_at: null,
    is_default: false,
    liquid: false,
    created_at: at(`${months[0]}-01`),
    ...a,
  });
  const assets = [
    asset({ id: banco, name: "Cuenta sueldo", kind: "cuenta", balance: 1185000, balance_at: anchor, is_default: true, sort: 0 }),
    asset({ id: mp, name: "Mercado Pago", kind: "cuenta", balance: 92400, balance_at: anchor, sort: 1 }),
    asset({ id: id("ast"), name: "Money market", kind: "fondo", balance: 950000, rate: 29, broker: "Mercado Pago", liquid: true, sort: 2 }),
    asset({ id: id("ast"), name: "S&P 500", kind: "cedear", ticker: "SPY", quantity: 12, last_price: 20920, price_at: now, broker: "Balanz", sort: 3 }),
    asset({ id: id("ast"), name: "Apple", kind: "cedear", ticker: "AAPL", quantity: 15, last_price: 16800, price_at: now, broker: "Balanz", sort: 4 }),
    asset({ id: id("ast"), name: "Plazo fijo", kind: "otro", balance: 600000, sort: 5 }),
  ];
  const asset_snapshots = [-5, -4, -3, -2, -1].map((k, i) => ({
    period: addMonths(M, k),
    total: 3050000 + i * 165000,
    cash: 1950000 + i * 60000,
    invested: 1100000 + i * 105000,
    mep: 1450 + i * 25,
  }));

  return {
    categories,
    recurring,
    cards: cards as unknown as Row[],
    purchases: purchases as unknown as Row[],
    transactions,
    splits,
    budgets,
    budget_categories,
    budget_snapshots: [],
    streak_days,
    assets,
    asset_snapshots,
    shared_groups: [],
    shared_members: [],
    shared_expenses: [],
    shared_payments: [],
    agent_tokens: [],
  };
}
