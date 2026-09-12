import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool } from "pg";

const DATABASE_URL = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
const db = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } }) : null;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MASTER = process.env.MASTER_API_TOKEN || "";
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};
const token = (req: IncomingMessage) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();

async function admin(req: IncomingMessage) {
  const t = token(req);
  if (!t) return false;
  if (MASTER && t === MASTER) return true;
  if (!SUPABASE_URL || !SERVICE) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE, authorization: `Bearer ${t}` } });
  if (!r.ok) return false;
  const u = await r.json() as { email?: string; app_metadata?: { role?: string } };
  return ADMIN_EMAILS.has(String(u.email || "").toLowerCase()) || u.app_metadata?.role === "admin";
}

async function sb(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE) throw new Error("Supabase configuration is missing");
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
}

async function ensureSettingsTable() {
  if (!db) return;
  await db.query(`
    create table if not exists master_license_settings (
      id text primary key,
      issuer text not null default 'orbitfs-license-master',
      audience text not null default 'orbitfs-runtime',
      entitlement_ttl_seconds integer not null default 10800,
      grace_seconds integer not null default 604800,
      revision bigint not null default 1,
      updated_at timestamptz not null default now()
    );
    alter table master_license_settings add column if not exists api_mode text not null default 'online';
    alter table master_license_settings add column if not exists allow_offline_grace boolean not null default true;
    insert into master_license_settings(id) values ('primary') on conflict (id) do nothing;
  `);
}

async function directSettings(method: string, input: Record<string, unknown> = {}) {
  if (!db) throw new Error("Database is not configured");
  await ensureSettingsTable();
  if (method === "GET") {
    const row = (await db.query("select id,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at from master_license_settings where id='primary'")).rows[0];
    return row;
  }
  const current = (await db.query("select * from master_license_settings where id='primary'")).rows[0] || {};
  const apiMode = ["online", "offline", "maintenance"].includes(String(input.api_mode ?? input.mode ?? current.api_mode ?? "online"))
    ? String(input.api_mode ?? input.mode ?? current.api_mode ?? "online")
    : "online";
  const row = (await db.query(
    `update master_license_settings set
      issuer=$1,
      audience=$2,
      entitlement_ttl_seconds=$3,
      grace_seconds=$4,
      api_mode=$5,
      allow_offline_grace=$6,
      revision=$7,
      updated_at=now()
     where id='primary'
     returning id,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at`,
    [
      String(input.issuer ?? current.issuer ?? "orbitfs-license-master"),
      String(input.audience ?? current.audience ?? "orbitfs-runtime"),
      Math.max(60, Math.floor(Number(input.entitlement_ttl_seconds ?? current.entitlement_ttl_seconds ?? 10800))),
      Math.max(0, Math.floor(Number(input.grace_seconds ?? current.grace_seconds ?? 604800))),
      apiMode,
      input.allow_offline_grace === undefined ? current.allow_offline_grace !== false : Boolean(input.allow_offline_grace),
      Math.max(1, Math.floor(Number(input.revision ?? Number(current.revision || 0) + 1))),
    ],
  )).rows[0];
  return row;
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : {};
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (!(await admin(req))) return json(res, 401, { error: "Administrator authentication is required" });
  try {
    if (req.method === "GET") {
      try {
        const settings = await directSettings("GET");
        return json(res, 200, { settings, database: true, settings_found: Boolean(settings) });
      } catch (directError) {
        if (!SUPABASE_URL || !SERVICE) throw directError;
        let r = await sb("/rest/v1/master_license_settings?id=eq.primary&select=*");
        let rows = await r.json().catch(() => []);
        if (!r.ok) return json(res, r.status, { error: `Supabase settings query failed (${r.status})`, detail: rows });
        if (!Array.isArray(rows) || !rows[0]) {
          r = await sb("/rest/v1/master_license_settings", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: "primary", issuer: "orbitfs-license-master", audience: "orbitfs-runtime", entitlement_ttl_seconds: 10800, grace_seconds: 604800, api_mode: "online", allow_offline_grace: true, revision: 1 }) });
          rows = await r.json().catch(() => []);
          if (!r.ok) return json(res, r.status, { error: `Supabase settings initialization failed (${r.status})`, detail: rows });
        }
        return json(res, 200, { settings: Array.isArray(rows) ? rows[0] : rows, database: true, settings_found: true });
      }
    }
    if (!["PATCH", "POST"].includes(req.method || "")) return json(res, 405, { error: "Method not allowed" });
    const input = await readBody(req);
    const settings = await directSettings(req.method || "PATCH", input);
    return json(res, 200, { settings, database: true });
  } catch (e) {
    return json(res, 502, { error: e instanceof Error ? e.message : "License settings operation failed" });
  }
}
