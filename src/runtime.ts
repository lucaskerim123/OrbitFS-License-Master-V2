import { COMPONENTS, json, now, type Env } from "./types";
import { sha256, signEntitlement } from "./crypto";

export async function validate(request: Request, env: Env) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const key = String(b.licenseKey || "").trim();
  const installationId = String(b.installationId || "").trim();
  if (!key || !installationId) return json({ error: "licenseKey and installationId are required" }, 400);
  const row = await env.DB.prepare("SELECT * FROM licences WHERE key_hash=? LIMIT 1").bind(await sha256(key)).first<any>();
  if (!row) return json({ error: "Licence not found", code: "LICENSE_NOT_FOUND" }, 404);
  const components = await env.DB.prepare("SELECT * FROM licence_components WHERE licence_id=?").bind(row.id).all<any>();
  const expired = row.expires_at && Date.parse(row.expires_at) <= Date.now();
  const state = expired ? "expired" : row.status;
  if (b.activate === true && state === "active") {
    for (const c of components.results || []) if (Number(c.enabled) === 1 && !c.installation_id)
      await env.DB.prepare("UPDATE licence_components SET installation_id=?,locked_at=? WHERE licence_id=? AND component=?")
        .bind(installationId, now(), row.id, c.component).run();
  }
  const fresh = await env.DB.prepare("SELECT * FROM licence_components WHERE licence_id=?").bind(row.id).all<any>();
  const result: Record<string, unknown> = {};
  for (const component of COMPONENTS) {
    const c = (fresh.results || []).find((x: any) => x.component === component);
    const enabled = Number(c?.enabled) === 1;
    const locked = c?.installation_id;
    result[component] = !enabled ? { allowed:false, state:"blocked", reason:"not_included" } : state !== "active" ?
      { allowed:false, state, reason:state } : !locked ?
      { allowed:true, state:"active", reason:"activation_required" } :
      { allowed:locked === installationId, state:locked === installationId ? "locked" : "blocked",
        lockedToThisInstallation: locked === installationId, reason:locked === installationId ? null : "locked_to_another_installation" };
  }
  const iat = Math.floor(Date.now() / 1000), ttl = Number(env.ENTITLEMENT_TTL_SECONDS || 10800);
  const payload = { iss:env.ENTITLEMENT_ISSUER, aud:env.ENTITLEMENT_AUDIENCE, iat, exp:iat+ttl,
    graceUntil:iat+ttl+Number(env.ENTITLEMENT_GRACE_SECONDS || 604800), valid:state === "active",
    reason:state === "active" ? null : state, licenceId:row.id, installationId, components:result };
  const entitlement = await signEntitlement(payload, env);
  return json({ entitlement, status:state });
}
