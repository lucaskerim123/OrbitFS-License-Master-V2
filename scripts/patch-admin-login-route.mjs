import { readFileSync, writeFileSync } from "node:fs";

const files = ["web/admin-control.html", "web/admin.html"];
for (const file of files) {
  let source = readFileSync(file, "utf8");
  const next = source.replaceAll("/api/auth/login", "/api/admin-control-login");
  if (next !== source) writeFileSync(file, next);
}

const serverFile = "src/server.ts";
let server = readFileSync(serverFile, "utf8");
const adminPageOld = 'const html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");';
const adminPageNew = 'const html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");';
if (server.includes(adminPageOld)) server = server.replace(adminPageOld, adminPageNew);

const marker = "// ORBITFS_ADMIN_CONTROL_LOGIN_PATCH";
if (!server.includes(marker)) {
  const handlerMarker = "export async function handler(req: IncomingMessage, res: ServerResponse) {";
  const loginHandler = `
${marker}
const adminControlLogin = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(res, 503, { error: "Supabase authentication is not configured" });
  try {
    const input = await body(req);
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!email || !password) return json(res, 400, { error: "Email and password are required" });
    const tokenResponse = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({})) as JsonObject;
    const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";
    if (!tokenResponse.ok || !accessToken) return json(res, 401, { error: String(tokenData.error_description || tokenData.msg || "Authentication failed") });
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: "Bearer " + accessToken },
    });
    if (!userResponse.ok) return json(res, 401, { error: "Unable to verify administrator account" });
    const user = await userResponse.json() as JsonObject;
    const metadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata as JsonObject : {};
    const userEmail = String(user.email || email).toLowerCase();
    if (!adminEmails.has(userEmail) && metadata.role !== "admin") return json(res, 403, { error: "Administrator access is required" });
    return json(res, 200, {
      access_token: accessToken,
      expires_in: Number(tokenData.expires_in || 0),
      user: { id: String(user.id || ""), email: String(user.email || email) },
    });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : "Authentication failed" });
  }
};

`;
  if (!server.includes(handlerMarker)) throw new Error("Vercel server handler marker not found");
  server = server.replace(handlerMarker, loginHandler + handlerMarker);
  const routeMarker = 'if (path === "/api/admin/me" && req.method === "GET") {';
  const route = 'if (path === "/api/admin-control-login" && req.method === "POST") return adminControlLogin(req, res);\n    if (path === "/api/auth/login" && req.method === "POST") return adminControlLogin(req, res);\n    ';
  if (!server.includes(routeMarker)) throw new Error("Admin route insertion marker not found");
  server = server.replace(routeMarker, route + routeMarker);
}
writeFileSync(serverFile, server);
