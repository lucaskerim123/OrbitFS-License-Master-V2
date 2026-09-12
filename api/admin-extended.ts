import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool } from "pg";

const DATABASE_URL = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
const db = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } }) : null;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const MASTER = process.env.MASTER_API_TOKEN || "";
const BILLING = process.env.BILLING_API_TOKEN || "";
const DEPLOYER = process.env.DEPLOYER_API_TOKEN || "";
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

const json = (res: ServerResponse, status: number, value: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(value)); };
const bearer = (req: IncomingMessage) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();

async function isAdmin(req: IncomingMessage) {
  const t = bearer(req);
  if (!t) return false;
  if (MASTER && t === MASTER) return true;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${t}` } });
  if (!r.ok) return false;
  const u = await r.json() as { email?: string; app_metadata?: { role?: string } };
  return ADMIN_EMAILS.has(String(u.email || "").toLowerCase()) || u.app_metadata?.role === "admin";
}

async function ensureSettingsTable() {
  if (!db) throw new Error("Database is not configured");
  await db.query(`create table if not exists master_license_settings (id text primary key, issuer text not null default 'orbitfs-license-master', audience text not null default 'orbitfs-runtime', entitlement_ttl_seconds integer not null default 10800, grace_seconds integer not null default 604800, revision bigint not null default 1, updated_at timestamptz not null default now()); alter table master_license_settings add column if not exists api_mode text not null default 'online'; alter table master_license_settings add column if not exists allow_offline_grace boolean not null default true; insert into master_license_settings(id) values ('primary') on conflict (id) do nothing;`);
}

async function settings(req: IncomingMessage) {
  await ensureSettingsTable();
  if (req.method === "GET") return (await db!.query("select id,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at from master_license_settings where id='primary'")).rows[0];
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : {};
  const current = (await db!.query("select * from master_license_settings where id='primary'")).rows[0] || {};
  const mode = String(input.api_mode ?? input.mode ?? current.api_mode ?? "online").toLowerCase();
  if (!["online", "offline", "maintenance"].includes(mode)) throw new Error("api_mode must be online, offline, or maintenance");
  return (await db!.query(`update master_license_settings set issuer=$1,audience=$2,entitlement_ttl_seconds=$3,grace_seconds=$4,api_mode=$5,allow_offline_grace=$6,revision=$7,updated_at=now() where id='primary' returning id,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at`, [String(input.issuer ?? current.issuer ?? "orbitfs-license-master"), String(input.audience ?? current.audience ?? "orbitfs-runtime"), Math.max(60, Math.floor(Number(input.entitlement_ttl_seconds ?? current.entitlement_ttl_seconds ?? 10800))), Math.max(0, Math.floor(Number(input.grace_seconds ?? current.grace_seconds ?? 604800))), mode, input.allow_offline_grace === undefined ? current.allow_offline_grace !== false : Boolean(input.allow_offline_grace), Math.max(1, Math.floor(Number(input.revision ?? Number(current.revision || 0) + 1)))])).rows[0];
}

async function proxy(req: IncomingMessage, res: ServerResponse, target: string) {
  if (!MASTER) return json(res, 503, { error: "MASTER_API_TOKEN is not configured" });
  const oldUrl = req.url; const oldAuth = req.headers.authorization;
  req.url = target; req.headers.authorization = `Bearer ${MASTER}`;
  try { const { handler } = await import("../src/server.js"); return handler(req, res); }
  finally { req.url = oldUrl; if (oldAuth === undefined) delete req.headers.authorization; else req.headers.authorization = oldAuth; }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (!(await isAdmin(req))) return json(res, 401, { error: "Administrator authentication is required" });
  const url = new URL(req.url || "/", "http://localhost");
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";
  try {
    if (action === "settings") { const s = await settings(req); return json(res, 200, { ok: true, settings: s, database: true, settings_found: true }); }
    if (action === "health") { const s = await settings({ ...req, method: "GET" } as IncomingMessage); return json(res, 200, { ok: true, database: true, settings_found: Boolean(s), api: "License Master V2", services: { billing: Boolean(BILLING), deployer: Boolean(DEPLOYER) }, endpoints: { base: "/api", versioned: "/api/v1", billing: ["/api/v1/products", "/api/v1/license/issue", "/api/v1/license/validate", "/api/v1/releases"], deployer: ["/api/v1/releases", "/api/v1/installations", "/api/v1/deployments"] } }); }
    if (action === "products") return proxy(req, res, "/api/v1/products");
    if (action === "releases") return proxy(req, res, "/api/v1/releases");
    if (action === "releaseCreate") return proxy(req, res, "/api/v1/releases");
    if (action === "releasePublish") return proxy(req, res, `/api/v1/releases/${encodeURIComponent(id)}/publish`);
    if (action === "releaseValidate") return proxy(req, res, `/api/v1/releases/${encodeURIComponent(id)}/validate`);
    if (action === "releasePause") return proxy(req, res, `/api/v1/releases/${encodeURIComponent(id)}/pause`);
    if (action === "releaseWithdraw") return proxy(req, res, `/api/v1/releases/${encodeURIComponent(id)}/withdraw`);
    if (action === "deployments") return proxy(req, res, "/api/v1/deployments");
    if (action === "installations") return proxy(req, res, "/api/v1/installations");
    if (action === "licenseIssue") return proxy(req, res, "/api/v1/license/issue");
    if (action === "executeDeployment") return proxy(req, res, "/api/v1/deployments/execute");
    if (action === "syncDeployment") return proxy(req, res, "/api/v1/deployments/sync");
    return json(res, 400, { error: "Unknown admin action" });
  } catch (e) { return json(res, 503, { ok: false, database: false, settings_found: false, error: e instanceof Error ? e.message : "License Master API operation failed" }); }
}
