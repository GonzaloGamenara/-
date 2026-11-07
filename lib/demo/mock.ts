import { uid } from "../format";
import { DEMO_USER, buildDemoDb, type DemoDb, type Row } from "./data";

/**
 * Supabase de mentira para /demo: responde en el navegador las llamadas REST y de login con una base
 * en memoria (datos ficticios). Nada sale a internet ni toca la cuenta real; al cerrar la pestaña se borra.
 */

const json = (data: unknown, status = 200) =>
  new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function compare(a: unknown, b: unknown) {
  if (typeof a === "number" || typeof b === "number") {
    const [x, y] = [Number(a), Number(b)];
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  }
  const [x, y] = [String(a), String(b)];
  return x < y ? -1 : x > y ? 1 : 0;
}

function test(r: Row, col: string, op: string, val: string): boolean {
  const v = r[col];
  switch (op) {
    case "eq":
      return String(v) === val;
    case "neq":
      return String(v) !== val;
    case "gt":
      return v != null && compare(v, val) > 0;
    case "gte":
      return v != null && compare(v, val) >= 0;
    case "lt":
      return v != null && compare(v, val) < 0;
    case "lte":
      return v != null && compare(v, val) <= 0;
    case "is":
      return val === "null" ? v == null : String(v) === val;
    case "in":
      return val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(v));
    default:
      return true;
  }
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function handleRest(db: DemoDb, method: string, url: URL, body: unknown, single: boolean) {
  const table = url.pathname.split("/").pop()!;
  const rows = (db[table] ??= []);
  const filters = [...url.searchParams].filter(([k]) => !RESERVED.has(k));
  const match = (r: Row) =>
    filters.every(([col, raw]) => {
      const [op, ...rest] = raw.split(".");
      const val = rest.join(".");
      if (op === "not") {
        const [op2, ...r2] = val.split(".");
        return !test(r, col, op2, r2.join("."));
      }
      return test(r, col, op, val);
    });

  if (method === "GET" || method === "HEAD") {
    let out = rows.filter(match);
    const order = url.searchParams.get("order");
    if (order) {
      const keys = order.split(",").map((o) => {
        const [col, dir] = o.split(".");
        return { col, desc: dir === "desc" };
      });
      out = [...out].sort((a, b) => {
        for (const k of keys) {
          const c = compare(a[k.col] ?? "", b[k.col] ?? "");
          if (c) return k.desc ? -c : c;
        }
        return 0;
      });
    }
    const limit = Number(url.searchParams.get("limit"));
    if (limit > 0) out = out.slice(0, limit);
    return json(single ? (out[0] ?? null) : out);
  }
  if (method === "POST") {
    const conflict = (url.searchParams.get("on_conflict") ?? "").split(",").filter((c) => c && c !== "user_id");
    const out: Row[] = [];
    for (const r of ([] as Row[]).concat(body as Row)) {
      if (conflict.length) {
        const i = rows.findIndex((x) => conflict.every((c) => x[c] === r[c]));
        if (i >= 0) {
          Object.assign(rows[i], r);
          out.push(rows[i]);
          continue;
        }
      }
      if (r.recurring_id && r.period && rows.some((x) => x.recurring_id === r.recurring_id && x.period === r.period)) continue;
      const row = { id: uid(), created_at: new Date().toISOString(), ...r };
      rows.push(row);
      out.push(row);
    }
    return json(single ? (out[0] ?? null) : out, 201);
  }
  if (method === "PATCH") {
    const out = rows.filter(match);
    out.forEach((r) => Object.assign(r, body as Row));
    return json(single ? (out[0] ?? null) : out);
  }
  if (method === "DELETE") {
    const out = rows.filter(match);
    db[table] = rows.filter((r) => !match(r));
    return json(out);
  }
  return json({ message: "método no soportado en la demo" }, 405);
}

export function demoSession() {
  return {
    access_token: "demo",
    refresh_token: "demo",
    token_type: "bearer",
    expires_in: 3600 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: DEMO_USER,
  };
}

/** fetch que atiende las llamadas a Supabase con la base de la demo y deja pasar el resto */
export function createDemoFetch(supabaseUrl: string): typeof fetch {
  const db = buildDemoDb();
  const user = structuredClone(DEMO_USER);
  return async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (!req.url.startsWith(supabaseUrl)) return fetch(input, init);
    const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
    const body = text ? JSON.parse(text) : null;
    if (url.pathname.startsWith("/auth/v1/")) {
      if (url.pathname.endsWith("/user") && req.method === "PUT" && body?.data) Object.assign(user.user_metadata, body.data);
      if (url.pathname.endsWith("/logout")) return new Response(null, { status: 204 });
      if (url.pathname.endsWith("/token")) return json({ ...demoSession(), user });
      return json(user);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) return json({ message: "no disponible en la demo" }, 400);
    if (url.pathname.startsWith("/rest/v1/")) {
      const single = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object");
      return handleRest(db, req.method, url, body, single);
    }
    return json({ message: "no disponible en la demo" }, 404);
  };
}
