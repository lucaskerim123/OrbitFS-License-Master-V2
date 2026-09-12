import { readFileSync, writeFileSync } from "node:fs";

const file = "src/server.ts";
let source = readFileSync(file, "utf8");
const oldBlock = `async function settings(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });`;
const newBlock = `async function settings(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "GET") {
    if (!allowed(req, ["master", "billing", "deployer"])) return json(res, 401, { error: "Unauthorized" });
  } else if (!allowed(req, ["master"])) {
    return json(res, 401, { error: "Unauthorized" });
  }
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });`;
if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock, 1);
} else if (!source.includes("if (req.method === \"GET\") {\n    if (!allowed(req, [\"master\", \"billing\", \"deployer\"]))")) {
  throw new Error("License Master settings authority marker not found");
}
writeFileSync(file, source);

const adminFile = "api/admin-extended.ts";
let adminSource = readFileSync(adminFile, "utf8");
if (!adminSource.includes('import { Pool } from "pg";')) {
  adminSource = adminSource.replace('import type { IncomingMessage, ServerResponse } from "node:http";','import type { IncomingMessage, ServerResponse } from "node:http";\nimport { Pool } from "pg";');
}
if (!adminSource.includes("const SETTINGS_DATABASE_URL")) {
  const marker = 'const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));';
  const insert = `${marker}\nconst SETTINGS_DATABASE_URL = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");\nconst settingsDb = SETTINGS_DATABASE_URL ? new Pool({ connectionString: SETTINGS_DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } }) : null;`;
  if (!adminSource.includes(marker)) throw new Error("License Master admin marker not found");
  adminSource = adminSource.replace(marker, insert, 1);
}
const settingsStart = adminSource.indexOf("async function settingsAction(req: IncomingMessage, res: ServerResponse) {");
const settingsEnd = adminSource.indexOf("async function healthAction", settingsStart);
if (settingsStart < 0 || settingsEnd < 0) throw new Error("License Master admin settings function marker not found");
const replacement = `async function settingsAction(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!settingsDb) return json(res, 503, { error: "Database is not configured" });
    await settingsDb.query(\`create table if not exists master_license_settings (id text primary key,issuer text not null default 'orbitfs-license-master',audience text not null default 'orbitfs-runtime',entitlement_ttl_seconds integer not null default 10800,grace_seconds integer not null default 604800,revision bigint not null default 1,updated_at timestamptz not null default now()); alter table master_license_settings add column if not exists api_mode text not null default 'online'; alter table master_license_settings add column if not exists allow_offline_grace boolean not null default true; insert into master_license_settings(id) values ('primary') on conflict (id) do nothing;\`);
    if (req.method === "GET") {
      const row = (await settingsDb.query("select id,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at from master_license_settings where id='primary'")).rows[0] || {};
      return json(res, 200, { settings: { ...row, enabled: true, mode: String(row.api_mode || "online") === "online" ? "active" : String(row.api_mode || "online") }, database: true, settings_found: Boolean(row?.id) });
    }
    if (req.method !== "PATCH" && req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    const input = await readBody(req);
    const current = (await settingsDb.query("select * from master_license_settings where id='primary'")).rows[0] || {};
    const requestedMode = String(input.api_mode ?? input.mode ?? current.api_mode ?? "online").toLowerCase();
    const apiMode = requestedMode === "active" ? "online" : requestedMode;
    if (!["online", "offline", "maintenance"].includes(apiMode)) return json(res, 400, { error: "mode must be active, offline, or maintenance" });
    const row = (await settingsDb.query(\`update master_license_settings set issuer=$1,audience=$2,entitlement_ttl_seconds=$3,grace_seconds=$4,api_mode=$5,allow_offline_grace=$6,revision=$7,updated_at=now() where id='primary' returning id,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at\`, [
      String(input.issuer ?? current.issuer ?? "orbitfs-license-master"), String(input.audience ?? current.audience ?? "orbitfs-runtime"), Math.max(60, Math.floor(Number(input.entitlement_ttl_seconds ?? current.entitlement_ttl_seconds ?? 10800))), Math.max(0, Math.floor(Number(input.grace_seconds ?? current.grace_seconds ?? 604800))), apiMode, input.allow_offline_grace === undefined ? current.allow_offline_grace !== false : Boolean(input.allow_offline_grace), Math.max(1, Math.floor(Number(input.revision ?? Number(current.revision || 0) + 1))),
    ])).rows[0];
    return json(res, 200, { settings: { ...row, enabled: true, mode: apiMode === "online" ? "active" : apiMode }, database: true });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "License Master settings operation failed" });
  }
}

`;
adminSource = `${adminSource.slice(0, settingsStart)}${replacement}${adminSource.slice(settingsEnd)}`;
writeFileSync(adminFile, adminSource);
console.log("License Master settings use the master database, expose compatibility aliases, and are readable by billing/deployer");
