import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MASTER = process.env.MASTER_API_TOKEN || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};

const readBody = (req: IncomingMessage) => new Promise<Record<string, unknown>>((resolve, reject) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (chunk: Buffer | string) => {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > 1024 * 1024) { req.destroy(); reject(new Error("Request body is too large")); return; }
    chunks.push(b);
  });
  req.on("end", () => {
    if (!chunks.length) return resolve({});
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
      resolve(value as Record<string, unknown>);
    } catch { reject(new Error("Request body must be valid JSON")); }
  });
  req.on("error", reject);
});

async function isAdmin(req: IncomingMessage) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const user = await response.json() as Record<string, any>;
  const metadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return adminEmails.has(String(user.email || "").toLowerCase()) || metadata.role === "admin";
}

async function supabase(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function supabaseJson(path: string, init: RequestInit = {}) {
  const response = await supabase(path, { headers: { accept: "application/json", ...(init.headers || {}) }, ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((data as any)?.message || (data as any)?.hint || (data as any)?.error || `Supabase request failed (${response.status})`));
  return data;
}

async function githubSource(repo: string, branch: string) {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured for private release source access");
  const response = await fetch(`https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${GITHUB_TOKEN}`, "x-github-api-version": "2022-11-28", "user-agent": "OrbitFS-License-Master-V2" },
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && typeof data === "object" ? String(data.message || "GitHub source lookup failed") : "GitHub source lookup failed");
  const commit = Array.isArray(data) ? data[0] : null;
  if (!commit?.sha) throw new Error(`No commits found for ${repo} / ${branch}`);
  return { repo, branch, sha: String(commit.sha), shortSha: String(commit.sha).slice(0, 12), message: String(commit.commit?.message || "").split("\n")[0] || "No commit message", date: commit.commit?.author?.date || commit.commit?.committer?.date || null, url: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}` };
}

async function productAction(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://localhost");
  const id = url.searchParams.get("id") || "";
  try {
    if (req.method === "GET") {
      const rows = await supabaseJson("/rest/v1/license_products?select=*&order=sort_order.asc,name.asc");
      return json(res, 200, { products: Array.isArray(rows) ? rows : [] });
    }
    if (req.method === "POST") {
      const input = await readBody(req);
      const code = String(input.code || "").trim().toLowerCase();
      const name = String(input.name || "").trim();
      if (!/^[a-z0-9][a-z0-9_.-]{1,79}$/.test(code)) return json(res, 400, { error: "Product code must use lowercase letters, numbers, dots, underscores or hyphens." });
      if (!name) return json(res, 400, { error: "Product name is required" });
      const slug = String(input.slug || code).trim().toLowerCase();
      const payload = {
        id: String(input.id || `prod_${code}`), code, name, slug,
        description: String(input.description || ""), short_description: String(input.short_description || ""),
        product_type: String(input.product_type || "component"), active: input.active !== false,
        purchasable: input.purchasable !== false, public: input.public !== false,
        component_key: input.component_key ? String(input.component_key) : null, runtime: String(input.runtime || "engine"),
        requires_engine: input.requires_engine === true, requires_base: input.requires_base !== false,
        max_installations: Math.max(1, Math.min(100, Math.floor(Number(input.max_installations || 1)))),
        duration_days: input.duration_days ? Number(input.duration_days) : null,
        grace_seconds: input.grace_seconds ? Number(input.grace_seconds) : null,
        version_policy: String(input.version_policy || "latest"), release_channel: String(input.release_channel || "stable"),
        price_amount: Number(input.price_amount || 0), price_currency: String(input.price_currency || "AUD"),
        billing_interval: String(input.billing_interval || "one_time"), stripe_price_id: input.stripe_price_id || null,
        stripe_product_id: input.stripe_product_id || null, paypal_product_id: input.paypal_product_id || null,
        features: Array.isArray(input.features) ? input.features : [], metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
        entitlement_defaults: input.entitlement_defaults && typeof input.entitlement_defaults === "object" ? input.entitlement_defaults : {},
        display: input.display && typeof input.display === "object" ? input.display : {}, sort_order: Number(input.sort_order || 0), updated_at: new Date().toISOString(),
      };
      const rows = await supabaseJson("/rest/v1/license_products?on_conflict=code", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) });
      return json(res, 201, { product: Array.isArray(rows) ? rows[0] : rows });
    }
    if (req.method === "PATCH") {
      if (!id) return json(res, 400, { error: "Product id is required" });
      const input = await readBody(req);
      const allowed = ["name","slug","description","short_description","product_type","active","purchasable","public","component_key","runtime","requires_engine","requires_base","max_installations","duration_days","grace_seconds","version_policy","release_channel","price_amount","price_currency","billing_interval","stripe_price_id","stripe_product_id","paypal_product_id","features","metadata","entitlement_defaults","display","sort_order"];
      const payload: Record<string, unknown> = {};
      for (const key of allowed) if (key in input) payload[key] = input[key];
      payload.updated_at = new Date().toISOString();
      const rows = await supabaseJson(`/rest/v1/license_products?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
      if (!Array.isArray(rows) || !rows[0]) return json(res, 404, { error: "Product not found" });
      return json(res, 200, { product: rows[0] });
    }
    if (req.method === "DELETE") {
      if (!id) return json(res, 400, { error: "Product id is required" });
      await supabaseJson(`/rest/v1/license_products?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "Product catalogue operation failed" });
  }
}

async function settingsAction(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === "GET") {
      const rows = await supabaseJson("/rest/v1/master_license_settings?id=eq.primary&select=*");
      return json(res, 200, { settings: Array.isArray(rows) ? rows[0] || {} : {} });
    }
    if (req.method === "PATCH" || req.method === "POST") {
      const input = await readBody(req);
      const payload = {
        id: "primary",
        issuer: String(input.issuer || "orbitfs-license-master"), audience: String(input.audience || "orbitfs-runtime"),
        entitlement_ttl_seconds: Math.max(60, Math.floor(Number(input.entitlement_ttl_seconds || 10800))),
        grace_seconds: Math.max(0, Math.floor(Number(input.grace_seconds || 604800))), revision: Number(input.revision || 1), updated_at: new Date().toISOString(),
      };
      const rows = await supabaseJson("/rest/v1/master_license_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) });
      return json(res, 200, { settings: Array.isArray(rows) ? rows[0] : rows });
    }
    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "License Master settings operation failed" });
  }
}

async function healthAction(_req: IncomingMessage, res: ServerResponse) {
  try {
    const rows = await supabaseJson("/rest/v1/master_license_settings?id=eq.primary&select=id");
    return json(res, 200, { ok: true, database: true, settings: Array.isArray(rows) && rows.length > 0, api: "License Master V2" });
  } catch (error) {
    return json(res, 503, { ok: false, database: false, api: "License Master V2", error: error instanceof Error ? error.message : "Database health check failed" });
  }
}

export default async function adminExtended(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (!(await isAdmin(req))) return json(res, 401, { error: "Administrator authentication is required" });
  if (!MASTER) return json(res, 503, { error: "MASTER_API_TOKEN is not configured" });

  const url = new URL(req.url || "/", "http://localhost");
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";

  if (action === "releaseSource") {
    try {
      const requestedKind = String(req.headers["x-release-kind"] || url.searchParams.get("kind") || "update").toLowerCase();
      const kind = requestedKind === "base" ? "base" : "update";
      const source = kind === "base" ? await githubSource("lucaskerim123/V1-vercel-base", "base-release") : await githubSource("lucaskerim123/V1-vercel-engine", "release-updates");
      return json(res, 200, { source });
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : "Unable to read release source" });
    }
  }

  if (action === "products") return productAction(req, res);
  if (action === "settings") return settingsAction(req, res);
  if (action === "health") return healthAction(req, res);

  const map: Record<string, string> = {
    releases: "/api/v1/releases", releaseCreate: "/api/v1/releases", releasePublish: `/api/v1/releases/${encodeURIComponent(id)}/publish`, releaseValidate: `/api/v1/releases/${encodeURIComponent(id)}/validate`, releasePause: `/api/v1/releases/${encodeURIComponent(id)}/pause`, releaseWithdraw: `/api/v1/releases/${encodeURIComponent(id)}/withdraw`, deployments: "/api/v1/deployments", installations: "/api/v1/installations", licenseIssue: "/api/v1/license/issue", executeDeployment: "/api/v1/deployments/execute", syncDeployment: "/api/v1/deployments/sync",
  };
  const target = map[action];
  if (!target) return json(res, 400, { error: "Unknown admin action" });
  const oldUrl = req.url; const oldAuth = req.headers.authorization;
  req.url = target; req.headers.authorization = `Bearer ${MASTER}`;
  try { const { handler } = await import("../src/server.js"); return handler(req, res); }
  finally { req.url = oldUrl; if (oldAuth === undefined) delete req.headers.authorization; else req.headers.authorization = oldAuth; }
}
