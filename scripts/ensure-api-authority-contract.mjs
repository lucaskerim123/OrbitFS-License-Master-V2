import { readFileSync, writeFileSync } from "node:fs";

const file = "src/server.ts";
let source = readFileSync(file, "utf8");
const oldBlock = `async function settings(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });`;
const newBlock = `async function settings(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "GET") {
    if (!allowed(req, ["master", "billing", "deployer"])) return json(res, 401, { error: "Unauthorized" });
  } else if (!allowed(req, ["master"])) {
    return json(res, 401, { error: "Unauthorized" });
  }
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });`;
if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock, 1);
} else if (!source.includes('if (req.method === "GET") {\n    if (!allowed(req, ["master", "billing", "deployer"]))')) {
  throw new Error("License Master settings authority contract not found");
}
writeFileSync(file, source);

const adminFile = "api/admin-extended.ts";
let adminSource = readFileSync(adminFile, "utf8");

// The admin settings implementation is already database-backed in the current
// API. This guard must validate the real implementation rather than depend on
// a fragile function-boundary marker such as a specific healthAction function.
// Keep this step idempotent so harmless formatting/refactoring cannot break Vercel builds.
if (!adminSource.includes("const settingsDb =")) {
  if (!adminSource.includes('import { Pool } from "pg";')) {
    adminSource = adminSource.replace(
      'import type { IncomingMessage, ServerResponse } from "node:http";',
      'import type { IncomingMessage, ServerResponse } from "node:http";\nimport { Pool } from "pg";'
    );
  }
  const insert = `const SETTINGS_DATABASE_URL = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");\nconst settingsDb = SETTINGS_DATABASE_URL ? new Pool({ connectionString: SETTINGS_DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } }) : null;`;
  const marker = 'const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));';
  if (adminSource.includes(marker)) {
    adminSource = adminSource.replace(marker, `${marker}\n${insert}`, 1);
  } else {
    const match = adminSource.match(/const adminEmails\\s*=.*?;\\n/);
    if (!match || match.index === undefined) {
      throw new Error("License Master admin authentication source not found; cannot establish settings database transport safely");
    }
    const at = match.index + match[0].length;
    adminSource = `${adminSource.slice(0, at)}${insert}\n${adminSource.slice(at)}`;
  }
}

if (!adminSource.includes("async function settingsAction(req: IncomingMessage, res: ServerResponse)")) {
  throw new Error("License Master admin settings handler not found");
}
if (!adminSource.includes("master_license_settings")) {
  throw new Error("License Master admin settings database contract not found");
}

writeFileSync(adminFile, adminSource);
console.log("License Master settings use the master database, expose compatibility aliases, and are readable by billing/deployer");
