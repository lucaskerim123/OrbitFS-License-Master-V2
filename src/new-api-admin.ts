import { query } from "./new-api-db.js";
import { AuthorityError, requireAdmin, revision } from "./new-api-authority.js";

export async function masterStatus(req: Request) {
  await requireAdmin(req);
  const [settings, products] = await Promise.all([
    query<any>("select * from master_license_settings where id='primary' limit 1"),
    query<any>("select * from products order by code asc limit 500"),
  ]);
  return {
    ok: true,
    authority: "license-master",
    config: {
      url: "https://incendiarynetworks.cc/api",
      masterConfigured: Boolean(process.env.MASTER_API_TOKEN),
      billingConfigured: Boolean(process.env.BILLING_API_TOKEN),
      deployerConfigured: Boolean(process.env.DEPLOYER_API_TOKEN),
    },
    revision: revision(),
    products: { products: products.rows },
    settings: { settings: settings.rows[0] || null },
  };
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
  return {
    clients,
    activeToday: clients.filter((r: any) => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 24 * 60 * 60 * 1000).length,
    componentRegistrations: installations.rows.length,
  };
}

export async function adminLicenseControl(req: Request, id: string, action: string) {
  await requireAdmin(req);
  if (!id) throw new AuthorityError(400, "License ID is required", "LICENSE_ID_REQUIRED");
  if (!["activate", "suspend", "unlock", "terminate"].includes(action)) throw new AuthorityError(400, "Invalid license control action", "INVALID_ACTION");
  const status = action === "activate" ? "active" : action === "suspend" ? "suspended" : action === "terminate" ? "terminated" : null;
  if (status) {
    await query("update license_bindings set status=$1, desired_state=$1, remote_state=$1, updated_at=now() where id=$2 and archived_at is null", [status, id]);
    if (action !== "activate") await query("update license_installations set status='disabled', locked_at=coalesce(locked_at,now()) where binding_id=$1", [id]);
  } else {
    await query("update license_installations set status='active', locked_at=null, last_seen_at=now() where binding_id=$1", [id]);
  }
  return { ok: true, id, action, status: status || "unlocked" };
}
