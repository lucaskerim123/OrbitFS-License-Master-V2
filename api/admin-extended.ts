import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const MASTER = process.env.MASTER_API_TOKEN || "";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

async function isAdmin(req: IncomingMessage) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return false;
  const user = await response.json() as Record<string, any>;
  const metadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return adminEmails.has(String(user.email || "").toLowerCase()) || metadata.role === "admin";
}

export default async function adminExtended(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (!(await isAdmin(req))) { res.statusCode = 401; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ error: "Administrator authentication is required" })); }
  if (!MASTER) { res.statusCode = 503; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ error: "MASTER_API_TOKEN is not configured" })); }

  const url = new URL(req.url || "/", "http://localhost");
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";
  const map: Record<string,string> = {
    releases: "/api/v1/releases",
    releaseCreate: "/api/v1/releases",
    releasePublish: `/api/v1/releases/${encodeURIComponent(id)}/publish`,
    releaseValidate: `/api/v1/releases/${encodeURIComponent(id)}/validate`,
    releasePause: `/api/v1/releases/${encodeURIComponent(id)}/pause`,
    releaseWithdraw: `/api/v1/releases/${encodeURIComponent(id)}/withdraw`,
    deployments: "/api/v1/deployments",
    installations: "/api/v1/installations",
    products: "/api/v1/products",
    settings: "/api/v1/settings",
    executeDeployment: "/api/v1/deployments/execute",
    syncDeployment: "/api/v1/deployments/sync",
  };
  const target = map[action];
  if (!target) { res.statusCode = 400; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ error: "Unknown admin action" })); }
  const oldUrl = req.url;
  const oldAuth = req.headers.authorization;
  req.url = target;
  req.headers.authorization = `Bearer ${MASTER}`;
  try {
    const { handler } = await import("../src/server.js");
    return handler(req, res);
  } finally {
    req.url = oldUrl;
    if (oldAuth === undefined) delete req.headers.authorization; else req.headers.authorization = oldAuth;
  }
}
