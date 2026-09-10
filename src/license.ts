import { COMPONENTS, json, now, type Env } from "./types";
import { sha256 } from "./crypto";
import { requireRole } from "./auth";

function newKey() {
  const raw = crypto.randomUUID().replaceAll("-", "").toUpperCase();
  return `OFS-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}`;
}

async function audit(env: Env, type: string, id: string, action: string, actor: string, detail?: unknown) {
  await env.DB.prepare("INSERT INTO audit_log (id,entity_type,entity_id,action,actor_ref,detail,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), type, id, action, actor, detail == null ? null : JSON.stringify(detail), now()).run();
}

function output(row: any, components: any[] = []) {
  return {
    id: row.id, customerRef: row.customer_ref, orderRef: row.order_ref,
    productCode: row.product_code, status: row.status, expiresAt: row.expires_at,
    maxInstallations: row.max_installations ?? 1,
    metadata: JSON.parse(row.metadata_json || "{}"), createdAt: row.created_at, updatedAt: row.updated_at,
    components: components.map(c => ({ component: c.component, enabled: Number(c.enabled) === 1,
      installationId: c.installation_id, lockedAt: c.locked_at }))
  };
}

export async function listLicences(request: Request, env: Env) {
  if (!requireRole(request, env, ["master"])) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url), customer = url.searchParams.get("customerRef");
  const rows = customer
    ? await env.DB.prepare("SELECT * FROM licences WHERE customer_ref=? ORDER BY created_at DESC").bind(customer).all<any>()
    : await env.DB.prepare("SELECT * FROM licences ORDER BY created_at DESC").all<any>();
  return json({ licences: (rows.results || []).map(row => output(row)) });
}

export async function getLicence(request: Request, env: Env, id: string) {
  if (!requireRole(request, env, ["master", "billing"])) return json({ error: "Unauthorized" }, 401);
  const row = await env.DB.prepare("SELECT * FROM licences WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!row) return json({ error: "Licence not found" }, 404);
  const components = await env.DB.prepare("SELECT * FROM licence_components WHERE licence_id=? ORDER BY component").bind(id).all<any>();
  return json({ licence: output(row, components.results || []) });
}

export async function issue(request: Request, env: Env) {
  if (!requireRole(request, env, ["billing", "master"])) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const orderRef = String(b.orderRef || request.headers.get("x-orbitfs-order-ref") || "").trim();
  if (!orderRef) return json({ error: "orderRef is required" }, 400);
  const existing = await env.DB.prepare("SELECT * FROM licences WHERE order_ref=? LIMIT 1").bind(orderRef).first<any>();
  if (existing) return json({ licence: output(existing), idempotent: true });
  const key = newKey(), id = crypto.randomUUID(), stamp = now();
  const components = (b.components || {}) as Record<string, boolean>;
  const maxInstallations = Math.max(1, Math.min(100, Number(b.maxInstallations || 1)));
  await env.DB.prepare(`INSERT INTO licences
    (id,customer_ref,order_ref,product_code,key_hash,status,expires_at,max_installations,metadata_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id, String(b.customerRef || ""), orderRef,
    String(b.productCode || "orbitfs_base"), await sha256(key), "active",
    b.expiresAt ? String(b.expiresAt) : null, maxInstallations,
    JSON.stringify(b.metadata || {}), stamp, stamp).run();
  for (const component of COMPONENTS) await env.DB.prepare(
    "INSERT INTO licence_components (licence_id,component,enabled) VALUES (?,?,?)")
    .bind(id, component, component === "orbitfs_base" || components[component] === true ? 1 : 0).run();
  await audit(env, "licence", id, "issued", String(b.actorRef || "service"), { orderRef });
  return json({ licence: output({ ...((await env.DB.prepare("SELECT * FROM licences WHERE id=?").bind(id).first<any>()) as any) }),
    licenceKey: key, status: "active" }, 201);
}

export async function controlLicence(request: Request, env: Env, id: string) {
  if (!requireRole(request, env, ["master"])) return json({ error: "Unauthorized" }, 401);
  const licence = await env.DB.prepare("SELECT id,status FROM licences WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!licence) return json({ error: "Licence not found" }, 404);
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(b.action || "").trim(), stamp = now();
  if (!["activate", "suspend", "terminate", "unblock", "unlock", "set_component", "set_expiry"].includes(action))
    return json({ error: "Invalid action" }, 400);
  if (["activate", "unblock"].includes(action)) await env.DB.prepare("UPDATE licences SET status='active',updated_at=? WHERE id=?").bind(stamp,id).run();
  if (action === "suspend") await env.DB.prepare("UPDATE licences SET status='suspended',updated_at=? WHERE id=?").bind(stamp,id).run();
  if (action === "terminate") await env.DB.prepare("UPDATE licences SET status='terminated',updated_at=? WHERE id=?").bind(stamp,id).run();
  if (action === "unlock") await env.DB.prepare("UPDATE licence_components SET installation_id=NULL,locked_at=NULL WHERE licence_id=?").bind(id).run();
  if (action === "set_expiry") await env.DB.prepare("UPDATE licences SET expires_at=?,updated_at=? WHERE id=?")
    .bind(b.expiresAt ? String(b.expiresAt) : null, stamp, id).run();
  if (action === "set_component") {
    const component = String(b.component || "");
    if (!(COMPONENTS as readonly string[]).includes(component)) return json({ error: "Invalid component" }, 400);
    await env.DB.prepare("UPDATE licence_components SET enabled=?,updated_at=? WHERE licence_id=? AND component=?")
      .bind(b.enabled === true ? 1 : 0, stamp, id, component).run();
  }
  await audit(env, "licence", id, action, String(b.actorRef || "master"), b);
  return getLicence(request, env, id);
}
