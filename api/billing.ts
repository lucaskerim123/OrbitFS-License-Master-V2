import type { IncomingMessage, ServerResponse } from "node:http";

const BILLING_SITE_URL = String(process.env.BILLING_SITE_URL || "").replace(/\/$/, "");
const BILLING_API_TOKEN = process.env.BILLING_API_TOKEN || "";
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

function json(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}

function bearer(req: IncomingMessage) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

async function resolveUser(accessToken: string) {
  if (!accessToken || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json() as Record<string, unknown>;
  const metadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata as Record<string, unknown> : {};
  const email = String(user.email || "").trim().toLowerCase();
  if (!adminEmails.has(email) && metadata.role !== "admin") return null;
  return { id: String(user.id || ""), email: String(user.email || email), role: "admin" as const };
}

export default async function billing(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const token = bearer(req);
  if (!BILLING_API_TOKEN || token !== BILLING_API_TOKEN) return json(res, 401, { error: "Billing Store authentication is required" });
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  // Billing authenticates the service-to-service request with BILLING_API_TOKEN.
  // When it also supplies the logged-in user's Supabase token, Master verifies
  // that identity against the same Supabase Auth authority instead of inventing
  // a second Billing-side administrator account.
  const userToken = String(req.headers["x-orbitfs-user-token"] || "").trim();
  const user = userToken ? await resolveUser(userToken) : null;

  return json(res, 200, {
    ok: true,
    authority: "license-master",
    service: "OrbitFS License Master V2",
    billingSiteUrl: BILLING_SITE_URL || null,
    apiBase: "/api",
    identity: user ? { found: true, user } : { found: false },
    capabilities: {
      products: true,
      licenseIssue: true,
      licenseValidate: true,
      licenseRevision: true,
      licenses: true,
      installations: true,
      releases: true,
      deployments: true,
      deploymentSync: true,
      adminIdentity: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    },
    contract: {
      products: "/api/products",
      licenses: "/api/licenses",
      issue: "/api/license/issue",
      validate: "/api/license/validate",
      revision: "/api/license/revision",
      publicKey: "/api/license/public-key",
      installations: "/api/installations",
      releases: "/api/releases",
      deployments: "/api/deployments",
      deploymentSync: "/api/deployments/sync",
      billingIdentity: "/api/billing",
    },
  });
}
