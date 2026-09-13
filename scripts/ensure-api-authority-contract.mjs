import { readFileSync, writeFileSync } from "node:fs";

const file = "src/server.ts";
let source = readFileSync(file, "utf8");
const oldBlock = `async function settings(req: IncomingMessage, res: ServerResponse) {
  if (allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });`;
const oldBlock2 = `async function settings(req: IncomingMessage, res: ServerResponse) {
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
} else if (source.includes(oldBlock2)) {
  source = source.replace(oldBlock2, newBlock, 1);
} else if (!source.includes('if (req.method === "GET") {\n    if (!allowed(req, ["master", "billing", "deployer"]))')) {
  throw new Error("License Master settings authority contract not found");
}
writeFileSync(file, source);

const adminFile = "api/admin-extended.ts";
let adminSource = readFileSync(adminFile, "utf8");
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
    if (!match || match.index === undefined) throw new Error("License Master admin authentication source not found; cannot establish settings database transport safely");
    const at = match.index + match[0].length;
    adminSource = `${adminSource.slice(0, at)}${insert}\n${adminSource.slice(at)}`;
  }
}
if (!adminSource.includes("async function settingsAction(req: IncomingMessage, res: ServerResponse)")) throw new Error("License Master admin settings handler not found");
if (!adminSource.includes("master_license_settings")) throw new Error("License Master admin settings database contract not found");
writeFileSync(adminFile, adminSource);

// The production Admin UI must use the dedicated settings function. Do not route
// settings through the large catch-all admin-extended function: Vercel can resolve
// the dedicated api/admin-settings.ts function independently and reliably.
const uiFile = "api/admin.ts";
let uiSource = readFileSync(uiFile, "utf8");
uiSource = uiSource.replaceAll("/api/admin-extended?action=settings", "/api/admin-settings");

// The canonical Admin page also loads settings through ext('settings'). Point
// that one load directly at the dedicated Vercel function; otherwise the page
// still receives the catch-all 404 even though the injected controls are fixed.
const mainUiFile = "web/admin.html";
let mainUiSource = readFileSync(mainUiFile, "utf8");
mainUiSource = mainUiSource.replaceAll("ext('settings')", "api('/api/admin-settings')");
writeFileSync(mainUiFile, mainUiSource);

// Release source display is canonical and must never be inferred from a release row.
// Base deploys only from V1-vercel-base/base-release; updates only from V1-vercel-engine/release-updates.
const sourceDisplay = `window.renderReleaseSources=function(){if($("baseSource"))$("baseSource").innerHTML='<b>Base deployment source</b><span><a href="https://github.com/lucaskerim123/V1-vercel-base/tree/base-release" target="_blank" rel="noreferrer">https://github.com/lucaskerim123/V1-vercel-base/tree/base-release</a></span>';if($("updateSource"))$("updateSource").innerHTML='<b>Update release source</b><span><a href="https://github.com/lucaskerim123/V1-vercel-engine/tree/release-updates" target="_blank" rel="noreferrer">https://github.com/lucaskerim123/V1-vercel-engine/tree/release-updates</a></span>'};`;
uiSource = uiSource.replace(/window\.renderReleaseSources=function\(\)\{.*?\};\nwindow\.sourceBranch/s, `${sourceDisplay}\nwindow.sourceBranch`);
uiSource = uiSource.replace(/window\.loadReleaseSources=async function\(\)\{.*?\n\};/s, `window.loadReleaseSources=async function(){releaseSources.base={repo:'lucaskerim123/V1-vercel-base',branch:'base-release',url:'https://github.com/lucaskerim123/V1-vercel-base/tree/base-release'};releaseSources.update={repo:'lucaskerim123/V1-vercel-engine',branch:'release-updates',url:'https://github.com/lucaskerim123/V1-vercel-engine/tree/release-updates'};renderReleaseSources();};`);
writeFileSync(uiFile, uiSource);

console.log("License Master authority contract fixed: dedicated API settings endpoint, canonical release sources, and billing/deployer-readable master settings");
