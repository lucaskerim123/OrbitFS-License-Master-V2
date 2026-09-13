import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MASTER_API_TOKEN = process.env.MASTER_API_TOKEN || "";
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};

const bearer = (req: IncomingMessage) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();

export default async function adminMe(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const token = bearer(req);
  if (!token) return json(res, 401, { error: "Administrator authentication is required" });

  if (MASTER_API_TOKEN && token === MASTER_API_TOKEN) {
    return json(res, 200, { user: { id: "master-service", email: "master-service" }, authority: "master" });
  }

  if (!SUPABASE_URL || !(SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY)) {
    return json(res, 503, { error: "Supabase authentication is not configured" });
  }

  try {
    const key = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` },
    });
    if (!response.ok) return json(res, 401, { error: "Administrator authentication is required" });

    const user = await response.json() as { id?: string; email?: string; app_metadata?: { role?: string } };
    const email = String(user.email || "").trim().toLowerCase();
    if (!email || (!ADMIN_EMAILS.has(email) && user.app_metadata?.role !== "admin")) {
      return json(res, 403, { error: "Administrator access is required" });
    }

    return json(res, 200, { user: { id: String(user.id || ""), email } });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "Unable to verify administrator account" });
  }
}
