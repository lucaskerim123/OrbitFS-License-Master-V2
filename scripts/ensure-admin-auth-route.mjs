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

// Accept the configured entitlement key whether Vercel contains raw PEM, base64 PEM,
// or base64 DER. Node's crypto API supports PEM/DER private-key imports.
const oldKey = 'const privatePem = () => PRIVATE_KEY ? Buffer.from(PRIVATE_KEY, "base64").toString("utf8") : "";';
const newKey = 'const privatePem = () => {\n  const value = String(PRIVATE_KEY || "").trim().replace(/\\\\n/g, "\\n");\n  if (!value) return "";\n  if (value.includes("-----BEGIN")) return value;\n  try {\n    const decoded = Buffer.from(value, "base64");\n    const decodedText = decoded.toString("utf8");\n    if (decodedText.includes("-----BEGIN")) return decodedText;\n    for (const type of ["pkcs8", "pkcs1"]) {\n      try {\n        return createPrivateKey({ key: decoded, format: "der", type }).export({ type: "pkcs8", format: "pem" }).toString();\n      } catch {}\n    }\n  } catch {}\n  return "";\n};';
if (source.includes(oldKey)) source = source.replace(oldKey, newKey);

writeFileSync(file, source);

const patchDatabaseSource = (path) => {
  let value = readFileSync(path, "utf8");
  const oldServer = 'const databaseUrl = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");';
  const newServer = 'const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || "");';
  if (value.includes(oldServer)) value = value.replace(oldServer, newServer);
  const oldProducts = 'const db = process.env.DATABASE_URL ? new Pool({ connectionString: String(process.env.DATABASE_URL).replace(/[?&]sslmode=[^&]+/i, ""), max: 5, ssl: { rejectUnauthorized: false } }) : null;';
  const newProducts = 'const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || "");\nconst db = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 5, ssl: { rejectUnauthorized: false } }) : null;';
  if (value.includes(oldProducts)) value = value.replace(oldProducts, newProducts);
  if (!value.includes("const normalizeDatabaseUrl = (value) =>")) {
    const marker = 'const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || "");';
    const helper = 'const normalizeDatabaseUrl = (value) => {\n  const raw = String(value || "").replace(/[?&]sslmode=[^&]+/i, "");\n  if (!raw) return raw;\n  try {\n    const url = new URL(raw);\n    const match = url.hostname.match(/^db\\.([a-z0-9]+)\\.supabase\\.co$/i);\n    if (!match) return raw;\n    const projectRef = match[1];\n    const region = String(process.env.SUPABASE_DB_REGION || "us-west-2").trim();\n    const poolerHost = String(process.env.SUPABASE_POOLER_HOST || `aws-0-${region}.pooler.supabase.com`).trim();\n    url.hostname = poolerHost;\n    url.port = "6543";\n    if (url.username === "postgres") url.username = `postgres.${projectRef}`;\n    return url.toString();\n  } catch {\n    return raw;\n  }\n};\n\n';
    if (value.includes(marker)) value = value.replace(marker, helper + marker);
  }
  writeFileSync(path, value);
};

patchDatabaseSource("src/server.ts");
patchDatabaseSource("api/products.ts");
console.log("Admin authentication, Supabase serverless DB transport, and entitlement key parsing ensured");
