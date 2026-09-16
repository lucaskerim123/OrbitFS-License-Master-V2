import { randomUUID } from "node:crypto";
import { query } from "./new-api-db.js";
import { AuthorityError, requireAdmin, revision } from "./new-api-authority.js";

async function ensureSettings() {
  await query(`create table if not exists master_license_settings (id text primary key, enabled boolean not null default true, issuer text not null default 'orbitfs-license-master', audience text not null default 'orbitfs-runtime', entitlement_ttl_seconds integer not null default 10800, grace_seconds integer not null default 604800, api_mode text not null default 'online', allow_offline_grace boolean not null default true, revision bigint not null default 1, updated_at timestamptz not null default now())`);
  await query("alter table master_license_settings add column if not exists enabled boolean not null default true");
  await query("alter table master_license_settings add column if not exists issuer text not null default 'orbitfs-license-master'");
  await query("alter table master_license_settings add column if not exists audience text not null default 'orbitfs-runtime'");
  await query("alter table master_license_settings add column if not exists entitlement_ttl_seconds integer not null default 10800");
  await query("alter table master_license_settings add column if not exists grace_seconds integer not null default 604800");
  await query("alter table master_license_settings add column if not exists api_mode text not null default 'online'");
  await query("alter table master_license_settings add column if not exists allow_offline_grace boolean not null default true");
  await query("alter table master_license_settings add column if not exists revision bigint not null default 1");
  await query("alter table master_license_settings add column if not exists updated_at timestamptz not null default now()");
  await query("insert into master_license_settings(id) values ('primary') on conflict (id) do nothing");
  await query("update master_license_settings set issuer='orbitfs-website' where id='primary' and issuer='orbitfs-license-master'");
}

export async function masterStatus(req: Request) {
  await requireAdmin(req);
  await ensureSettings();
  const [settings, products] = await Promise.all([
    query<any>("select * from master_license_settings where id='primary' limit 1"),
    query<any>("select * from license_products order by code asc limit 500"),
  ]);
  const base = String(process.env.SITE_URL || "https://incendiarynetworks.cc").replace(/\/$/, "");
  const adminPanel = String(process.env.ADMIN_PANEL_URL || "https://panel.incendiarynetworks.cc").replace(/\/$/, "");
  const apiBase = String(process.env.LICENSE_API_BASE_URL || `${base}/api`).replace(/\/$/, "");
  return { ok: true, authority: "license-master", config: { url: apiBase, versionedUrl: `${apiBase}/license/v1`, adminPanelUrl: adminPanel, masterConfigured: Boolean(process.env.MASTER_API_TOKEN), billingConfigured: Boolean(process.env.BILLING_API_TOKEN), deployerConfigured: Boolean(process.env.DEPLOYER_API_TOKEN) }, revision: revision(), products: { products: products.rows }, settings: { settings: settings.rows[0] || null } };
}

export async function licenseSettings(req: Request, input?: Record<string, unknown>) {
  await requireAdmin(req);
  await ensureSettings();
  if (!input) {
    const row = (await query<any>("select id,enabled,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at from master_license_settings where id='primary' limit 1")).rows[0];
    return { ok: true, settings: row || null };
  }
  const current = (await query<any>("select * from master_license_settings where id='primary' limit 1")).rows[0] || {};
  const requestedMode = String(input.api_mode ?? input.mode ?? current.api_mode ?? "online").toLowerCase();
  const mode = requestedMode === "active" ? "online" : requestedMode;
  if (!["online", "offline", "maintenance"].includes(mode)) throw new AuthorityError(400, "api_mode must be online, offline, or maintenance", "INVALID_API_MODE");
  const enabled = input.enabled === undefined ? current.enabled !== false : Boolean(input.enabled);
  const ttl = Number(input.entitlement_ttl_seconds ?? current.entitlement_ttl_seconds ?? 10800);
  const grace = Number(input.grace_seconds ?? current.grace_seconds ?? 604800);
  const issuer = String(input.issuer ?? current.issuer ?? "orbitfs-website").trim();
  const audience = String(input.audience ?? current.audience ?? "orbitfs-runtime").trim();
  const allowOfflineGrace = input.allow_offline_grace === undefined ? current.allow_offline_grace !== false : Boolean(input.allow_offline_grace);
  if (!issuer || !audience) throw new AuthorityError(400, "Issuer and audience are required", "INVALID_SETTINGS");
  if (!Number.isFinite(ttl) || !Number.isFinite(grace)) throw new AuthorityError(400, "TTL and grace period must be valid numbers", "INVALID_SETTINGS");
  const revisionNumber = Math.max(1, Math.floor(Number(current.revision || 0) + 1));
  const row = (await query<any>(`update master_license_settings set enabled=$1,issuer=$2,audience=$3,entitlement_ttl_seconds=$4,grace_seconds=$5,api_mode=$6,allow_offline_grace=$7,revision=$8,updated_at=now() where id='primary' returning id,enabled,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at`, [enabled, issuer, audience, Math.max(60, Math.floor(ttl)), Math.max(0, Math.floor(grace)), mode, allowOfflineGrace, revisionNumber])).rows[0];
  if (!row) throw new AuthorityError(503, "License Master settings row is unavailable", "SETTINGS_UNAVAILABLE");
  return { ok: true, settings: row };
}

export async function runtimeClients(req: Request) {
  await requireAdmin(req);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [installations, validations] = await Promise.all([
    query<any>("select id,binding_id,installation_id,component_key,device_name,platform,app_version,last_seen_at,registered_at,status from license_installations order by last_seen_at desc limit 10000"),
    query<any>("select installation_id,component_key,user_agent,created_at from license_validation_log where installation_id is not null and created_at >= $1 order by created_at desc limit 10000", [since]),
  ]);
  const map: Record<string, any> = {};
  for (const row of installations.rows) {
    const key = row.installation_id || row.id;
    if (!map[key]) map[key] = { installation_id: key, device_name: row.device_name, platform: row.platform, app_version: row.app_version, last_seen_at: row.last_seen_at, registered_at: row.registered_at, components: [], registered: true };
    if (row.component_key && !map[key].components.includes(row.component_key)) map[key].components.push(row.component_key);
    if (row.last_seen_at && (!map[key].last_seen_at || new Date(row.last_seen_at) > new Date(map[key].last_seen_at))) map[key].last_seen_at = row.last_seen_at;
    if (row.status !== "active") map[key].registered = false;
  }
  for (const row of validations.rows) {
    const key = row.installation_id;
    if (!key) continue;
    if (!map[key]) map[key] = { installation_id: key, device_name: null, platform: null, app_version: null, last_seen_at: row.created_at, registered_at: null, components: [], registered: false };
    if (row.component_key && !map[key].components.includes(row.component_key)) map[key].components.push(row.component_key);
    if (row.created_at && (!map[key].last_seen_at || new Date(row.created_at) > new Date(map[key].last_seen_at))) map[key].last_seen_at = row.created_at;
  }
  const clients = Object.values(map).sort((a: any, b: any) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime());
  return { clients, activeToday: clients.filter((r: any) => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 24 * 60 * 60 * 1000).length, componentRegistrations: installations.rows.length };
}

export async function adminLicenseControl(req: Request, id: string, action: string) {
  const user = await requireAdmin(req);
  if (!id) throw new AuthorityError(400, "License ID is required", "LICENSE_ID_REQUIRED");
  if (!["activate", "suspend", "unlock", "terminate"].includes(action)) throw new AuthorityError(400, "Invalid license control action", "INVALID_ACTION");
  const status = action === "activate" ? "active" : action === "suspend" ? "suspended" : action === "terminate" ? "terminated" : null;
  if (status) {
    await query("update license_bindings set status=$1, desired_state=$1, remote_state=$1, updated_at=now() where id=$2 and archived_at is null", [status, id]);
    if (action !== "activate") await query("update license_installations set status='disabled', locked_at=coalesce(locked_at,now()) where binding_id=$1", [id]);
  } else await query("update license_installations set status='active', locked_at=null, last_seen_at=now() where binding_id=$1", [id]);
  try { await query("insert into audit_log(id,entity_type,entity_id,action,actor_ref,detail) values($1,$2,$3,$4,$5,$6)", [randomUUID(), "licence", id, `admin.${action}`, String(user.id || user.email || "admin"), { action }]); } catch {}
  return { ok: true, id, action, status: status || "unlocked" };
}