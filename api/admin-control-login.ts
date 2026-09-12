import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

async function body(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 10000) reject(new Error("Request too large")); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
function json(res: ServerResponse, status: number, data: unknown) { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(data)); }

export default async function adminControlLogin(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(res, 503, { error: "Supabase authentication is not configured" });
  try {
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!email || !password) return json(res, 400, { error: "Email and password are required" });
    const tokenResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    const tokenData = await tokenResponse.json() as Record<string, any>;
    if (!tokenResponse.ok || !tokenData.access_token) return json(res, 401, { error: tokenData.error_description || tokenData.msg || "Authentication failed" });
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${tokenData.access_token}` } });
    const user = await userResponse.json() as Record<string, any>;
    const metadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
    if (!adminEmails.has(email) && metadata.role !== "admin") return json(res, 403, { error: "Administrator access is required" });
    return json(res, 200, { access_token: tokenData.access_token, expires_in: tokenData.expires_in, user: { id: user.id, email: user.email } });
  } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : "Authentication failed" }); }
}
