import type { IncomingMessage, ServerResponse } from "node:http";

// License Master V2 owns its administrator authentication.  The canonical
// Supabase project is the dedicated OrbitFS-License-Master-V2 project.
// Do not fall back to the retired Supabase project here.
const SUPABASE_URL = "https://fwtremoroucmdyjkbfnp.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  "sb_publishable__JcR8IxEj__iwetiIajyFQ_Fa3Rl8Mc";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "lucas.kerim@gmail.com").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

async function body(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 10000) reject(new Error("Request too large")); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
function json(res: ServerResponse, status: number, data: unknown) { res.statusCode = status; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(data)); }

export default async function adminControlLogin(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const input = (await body(req)) as Record<string, unknown>;
    const email = String(input.email ?? "").trim().toLowerCase();
    const password = String(input.password ?? "");
    if (!email || !password) return json(res, 400, { error: "Email and password are required" });

    const tokenResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
    const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";
    const expiresIn = typeof tokenData.expires_in === "number" ? tokenData.expires_in : 0;
    if (!tokenResponse.ok || !accessToken) return json(res, 401, { error: tokenData.error_description || tokenData.msg || "Authentication failed" });

    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` } });
    const user = (await userResponse.json()) as Record<string, unknown>;
    if (!userResponse.ok) return json(res, 401, { error: "Unable to verify administrator account" });
    const metadataRaw = user.app_metadata && typeof user.app_metadata === "object" ? (user.app_metadata as Record<string, unknown>) : {};
    const role = typeof metadataRaw.role === "string" ? metadataRaw.role : undefined;
    const userEmail = typeof user.email === "string" ? user.email.toLowerCase() : email;
    if (!adminEmails.has(userEmail) && role !== "admin") return json(res, 403, { error: "Administrator access is required" });

    const userId = typeof user.id === "string" ? user.id : "";
    return json(res, 200, { access_token: accessToken, expires_in: expiresIn, user: { id: userId, email: userEmail } });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "Authentication failed" });
  }
}
