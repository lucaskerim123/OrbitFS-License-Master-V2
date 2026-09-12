import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const db = process.env.DATABASE_URL ? new Pool({ connectionString: String(process.env.DATABASE_URL).replace(/[?&]sslmode=[^&]+/i, ""), max: 5, ssl: { rejectUnauthorized: false } }) : null;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
const CORS = process.env.CORS_ORIGINS || "https://incendiarynetworks.cc,https://www.incendiarynetworks.cc";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const send = (res: ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
};
const bearer = (req: IncomingMessage) => {
  const v = String(req.headers.authorization || "");
  return v.startsWith("Bearer ") ? v.slice(7).trim() : "";
};
const read = (req: IncomingMessage) => new Promise<Json>((resolve, reject) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (c: Buffer | string) => { const b = Buffer.isBuffer(c) ? c : Buffer.from(c); size += b.length; if (size > 1024 * 1024) { reject(new Error("Request too large")); req.destroy(); return; } chunks.push(b); });
  req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(new Error("Invalid JSON")); } });
  req.on("error", reject);
});
const admin = async (req: IncomingMessage) => {
  const token = bearer(req);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return false;
  const u = await r.json() as Json;
  const m = u.app_metadata && typeof u.app_metadata === "object" ? u.app_metadata : {};
  return adminEmails.has(String(u.email || "").toLowerCase()) || m.role === "admin";
};
const clean = (p: Json) => ({
  id: p.id, code: p.code, name: p.name, slug: p.slug, description: p.description, shortDescription: p.short_description,
  productType: p.product_type, active: p.active, purchasable: p.purchasable, public: p.public,
  componentKey: p.component_key, runtime: p.runtime, requiresEngine: p.requires_engine, requiresBase: p.requires_base,
  maxInstallations: p.max_installations, durationDays: p.duration_days, graceSeconds: p.grace_seconds,
  versionPolicy: p.version_policy, releaseChannel: p.release_channel, priceAmount: p.price_amount,
  priceCurrency: p.price_currency, billingInterval: p.billing_interval, stripePriceId: p.stripe_price_id,
  stripeProductId: p.stripe_product_id, paypalProductId: p.paypal_product_id, features: p.features,
  metadata: p.metadata, entitlementDefaults: p.entitlement_defaults, display: p.display, sortOrder: p.sort_order,
  createdAt: p.created_at, updatedAt: p.updated_at,
});
const normalize = (b: Json) => ({
  code: String(b.code || "").trim(), name: String(b.name || "").trim(), slug: String(b.slug || b.code || "").trim().toLowerCase(),
  description: String(b.description || ""), short_description: String(b.shortDescription ?? b.short_description ?? ""),
  product_type: String(b.productType ?? b.product_type ?? "component"), active: b.active !== false,
  purchasable: b.purchasable !== false, public: b.public !== false, component_key: b.componentKey ?? b.component_key ?? null,
  runtime: String(b.runtime || "engine"), requires_engine: b.requiresEngine === true, requires_base: b.requiresBase !== false,
  max_installations: Math.max(1, Math.min(100, Number(b.maxInstallations ?? b.max_installations ?? 1))),
  duration_days: b.durationDays ?? b.duration_days ?? null, grace_seconds: b.graceSeconds ?? b.grace_seconds ?? null,
  version_policy: String(b.versionPolicy || "latest"), release_channel: String(b.releaseChannel || "stable"),
  price_amount: Number(b.priceAmount ?? b.price_amount ?? 0), price_currency: String(b.priceCurrency || "AUD").toUpperCase(),
  billing_interval: String(b.billingInterval || "one_time"), stripe_price_id: b.stripePriceId ?? b.stripe_price_id ?? null,
  stripe_product_id: b.stripeProductId ?? b.stripe_product_id ?? null, paypal_product_id: b.paypalProductId ?? b.paypal_product_id ?? null,
  features: Array.isArray(b.features) ? b.features : [], metadata: b.metadata && typeof b.metadata === "object" ? b.metadata : {},
  entitlement_defaults: b.entitlementDefaults && typeof b.entitlementDefaults === "object" ? b.entitlementDefaults : {},
  display: b.display && typeof b.display === "object" ? b.display : {}, sort_order: Number(b.sortOrder ?? b.sort_order ?? 0),
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const origin = String(req.headers.origin || "");
  if (origin && CORS.split(",").map(x => x.trim()).includes(origin)) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization,content-type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (!db) return send(res, 503, { error: "Database is not configured" });
  const url = new URL(req.url || "/", "http://localhost");
  const id = url.searchParams.get("id");
  try {
    if (req.method === "GET") {
      const adminView = url.searchParams.get("admin") === "1";
      if (adminView && !(await admin(req))) return send(res, 401, { error: "Administrator authentication is required" });
      const rows = id
        ? (await db.query("select * from license_products where id=$1 or code=$1 or slug=$1 limit 1", [id])).rows
        : (await db.query(adminView ? "select * from license_products order by sort_order,name" : "select * from license_products where active=true and public=true order by sort_order,name")).rows;
      if (id && !rows[0]) return send(res, 404, { error: "Product not found" });
      return send(res, 200, id ? { product: clean(rows[0]) } : { products: rows.map(clean) });
    }
    if (!(await admin(req))) return send(res, 401, { error: "Administrator authentication is required" });
    if (req.method === "POST") {
      const p = normalize(await read(req));
      if (!p.code || !p.name || !p.slug) return send(res, 400, { error: "code, name and slug are required" });
      const row = (await db.query(`insert into license_products
        (id,code,name,slug,description,short_description,product_type,active,purchasable,public,component_key,runtime,requires_engine,requires_base,max_installations,duration_days,grace_seconds,version_policy,release_channel,price_amount,price_currency,billing_interval,stripe_price_id,stripe_product_id,paypal_product_id,features,metadata,entitlement_defaults,display,sort_order)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) returning *`,
        [randomUUID(),p.code,p.name,p.slug,p.description,p.short_description,p.product_type,p.active,p.purchasable,p.public,p.component_key,p.runtime,p.requires_engine,p.requires_base,p.max_installations,p.duration_days,p.grace_seconds,p.version_policy,p.release_channel,p.price_amount,p.price_currency,p.billing_interval,p.stripe_price_id,p.stripe_product_id,p.paypal_product_id,p.features,p.metadata,p.entitlement_defaults,p.display,p.sort_order])).rows[0];
      return send(res, 201, { product: clean(row) });
    }
    if (!id) return send(res, 400, { error: "id is required" });
    if (req.method === "PATCH") {
      const existing = (await db.query("select * from license_products where id=$1 or code=$1 or slug=$1 limit 1", [id])).rows[0];
      if (!existing) return send(res, 404, { error: "Product not found" });
      const p = normalize({ ...existing, ...(await read(req)) });
      const row = (await db.query(`update license_products set code=$1,name=$2,slug=$3,description=$4,short_description=$5,product_type=$6,active=$7,purchasable=$8,public=$9,component_key=$10,runtime=$11,requires_engine=$12,requires_base=$13,max_installations=$14,duration_days=$15,grace_seconds=$16,version_policy=$17,release_channel=$18,price_amount=$19,price_currency=$20,billing_interval=$21,stripe_price_id=$22,stripe_product_id=$23,paypal_product_id=$24,features=$25,metadata=$26,entitlement_defaults=$27,display=$28,sort_order=$29,updated_at=now() where id=$30 returning *`,
        [p.code,p.name,p.slug,p.description,p.short_description,p.product_type,p.active,p.purchasable,p.public,p.component_key,p.runtime,p.requires_engine,p.requires_base,p.max_installations,p.duration_days,p.grace_seconds,p.version_policy,p.release_channel,p.price_amount,p.price_currency,p.billing_interval,p.stripe_price_id,p.stripe_product_id,p.paypal_product_id,p.features,p.metadata,p.entitlement_defaults,p.display,p.sort_order,existing.id])).rows[0];
      return send(res, 200, { product: clean(row) });
    }
    if (req.method === "DELETE") {
      const result = await db.query("update license_products set active=false,purchasable=false,public=false,updated_at=now() where id=$1 or code=$1 or slug=$1", [id]);
      return result.rowCount ? send(res, 200, { ok: true, archived: true }) : send(res, 404, { error: "Product not found" });
    }
    return send(res, 405, { error: "Method not allowed" });
  } catch (e: unknown) {
    if (e instanceof Error && e.message) {
      return send(res, 400, { error: e.message });
    }
    return send(res, 400, { error: "Product operation failed" });
  }
}
