import { COMPONENTS, json, now, type Env } from "./types";
import { sha256 } from "./crypto";

function authorized(request: Request, token: string) {
  return request.headers.get("authorization") === `Bearer ${token}`;
}

function newKey() {
  const raw = crypto.randomUUID().replaceAll("-", "").toUpperCase();
  return `OFS-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}`;
}

export async function issue(request: Request, env: Env) {
  if (!authorized(request, env.BILLING_API_TOKEN)) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const orderRef = String(b.orderRef || request.headers.get("x-orbitfs-order-ref") || "").trim();
  if (!orderRef) return json({ error: "orderRef is required" }, 400);
  const existing = await env.DB.prepare("SELECT * FROM licences WHERE order_ref=? LIMIT 1").bind(orderRef).first<any>();
  if (existing) return json({ licenceId: existing.id, status: existing.status, idempotent: true });
  const key = newKey(), id = crypto.randomUUID(), stamp = now();
  const components = (b.components || {}) as Record<string, boolean>;
  await env.DB.prepare(`INSERT INTO licences
    (id,customer_ref,order_ref,product_code,key_hash,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(id, String(b.customerRef || ""), orderRef,
    String(b.productCode || "orbitfs_base"), await sha256(key), "active", stamp, stamp).run();
  for (const component of COMPONENTS) await env.DB.prepare(
    "INSERT INTO licence_components (licence_id,component,enabled) VALUES (?,?,?)")
    .bind(id, component, component === "orbitfs_base" || components[component] === true ? 1 : 0).run();
  await audit(env, id, "issued", String(b.actorRef || "website"));
  return json({ licenceId: id, licenceKey: key, status: "active" }, 201);
}

async function audit(env: Env, id: string, action: string, actor: string, detail?: unknown) {
  await env.DB.prepare("INSERT INTO audit_log (id,entity_type,entity_id,action,actor_ref,detail,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), "licence", id, action, actor, detail ? JSON.stringify(detail) : null, now()).run();
}
