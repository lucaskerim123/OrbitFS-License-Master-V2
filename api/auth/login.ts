import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

async function readBody(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += String(chunk);
      if (raw.length > 10000) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

export default async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(res, 503, { error: "Supabase authentication is not configured" });
  }

  try {
    const input = await readBody(req);
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!email || !password) return json(res, 400, { error: "Email and password are required" });

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const rawData: unknown = await response.json().catch(() => ({}));
    if (
      !response.ok ||
      typeof rawData !== 'object' ||
      rawData === null ||
      typeof (rawData as { access_token?: unknown }).access_token !== 'string'
    ) {
      return json(res, 401, { error: "Invalid License Master administrator credentials" });
    }
    const data = rawData as { access_token: string; expires_in: number };

    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${data.access_token}` },
    });
    if (!userResponse.ok) return json(res, 401, { error: "Unable to verify administrator account" });

    const rawUser: unknown = await userResponse.json();
    if (typeof rawUser !== 'object' || rawUser === null) {
      return json(res, 401, { error: "Unable to verify administrator account" });
    }
    const user = rawUser as { id: string; email: string; app_metadata?: unknown };
    const metadata =
      typeof user.app_metadata === 'object' && user.app_metadata !== null
        ? (user.app_metadata as { role?: string })
        : {};
    if (!adminEmails.has(user.email.toLowerCase()) && metadata.role !== "admin") {
      return json(res, 403, { error: "Administrator access is required" });
    }

    return json(res, 200, {
      access_token: data.access_token,
      expires_in: data.expires_in,
      user: { id: user.id, email: user.email },
    });
  } catch (error: unknown) {
    return json(res, 400, { error: error instanceof Error ? error.message : "Authentication failed" });
  }
}
