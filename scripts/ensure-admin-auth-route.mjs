import { readFileSync, writeFileSync } from "node:fs";

const file = "src/server.ts";
let source = readFileSync(file, "utf8");

const functionMarker = "const requireAdmin = async (req: IncomingMessage) => {";
const functionCode = [
  "const adminLogin = async (req: IncomingMessage, res: ServerResponse) => {",
  "  if (req.method !== \"POST\") return json(res, 405, { error: \"Method not allowed\" });",
  "  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(res, 503, { error: \"Supabase authentication is not configured\" });",
  "  try {",
  "    const input = await body(req);",
  "    const email = String(input.email || \"\").trim().toLowerCase();",
  "    const password = String(input.password || \"\");",
  "    if (!email || !password) return json(res, 400, { error: \"Email and password are required\" });",
  "",
  "    const tokenResponse = await fetch(SUPABASE_URL + \"/auth/v1/token?grant_type=password\", {",
  "      method: \"POST\",",
  "      headers: { apikey: SUPABASE_ANON_KEY, \"content-type\": \"application/json\" },",
  "      body: JSON.stringify({ email, password }),",
  "    });",
  "    const tokenData = await tokenResponse.json().catch(() => ({}));",
  "    if (!tokenResponse.ok || !tokenData.access_token) return json(res, 401, { error: \"Invalid License Master administrator credentials\" });",
  "",
  "    const userResponse = await fetch(SUPABASE_URL + \"/auth/v1/user\", {",
  "      headers: { apikey: SUPABASE_ANON_KEY, authorization: \"Bearer \" + tokenData.access_token },",
  "    });",
  "    if (!userResponse.ok) return json(res, 401, { error: \"Unable to verify administrator account\" });",
  "    const user = await userResponse.json();",
  "    const metadata = user.app_metadata && typeof user.app_metadata === \"object\" ? user.app_metadata : {};",
  "    if (!adminEmails.has(String(user.email || email).toLowerCase()) && metadata.role !== \"admin\") return json(res, 403, { error: \"Administrator access is required\" });",
  "",
  "    return json(res, 200, { access_token: tokenData.access_token, expires_in: tokenData.expires_in, user: { id: user.id, email: user.email } });",
  "  } catch (error) {",
  "    return json(res, 400, { error: error instanceof Error ? error.message : \"Authentication failed\" });",
  "  }",
  "};",
  "",
].join("\n");

if (!source.includes("const adminLogin = async (req: IncomingMessage, res: ServerResponse) => {")) {
  if (!source.includes(functionMarker)) throw new Error("server.ts auth insertion marker not found");
  source = source.replace(functionMarker, functionCode + functionMarker);
}

const routeMarker = "    if (path === \"/api/admin/me\" && req.method === \"GET\") {";
const routeCode = "    if ((path === \"/api/auth/login\" || path === \"/api/admin/control-login\") && req.method === \"POST\") return adminLogin(req, res);\n";
if (!source.includes(routeCode)) {
  if (!source.includes(routeMarker)) throw new Error("server.ts route insertion marker not found");
  source = source.replace(routeMarker, routeCode + routeMarker);
}

writeFileSync(file, source);
console.log("Admin authentication route ensured in src/server.ts");
