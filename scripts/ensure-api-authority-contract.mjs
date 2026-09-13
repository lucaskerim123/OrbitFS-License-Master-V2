import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const roots = ["api", "src", "web", "tools", "docs", "scripts"];
const files = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
};
for (const root of roots) walk(root);

for (const file of files) {
  let source;
  try { source = readFileSync(file, "utf8"); } catch { continue; }
  let next = source
    .replaceAll("/api/v1/", "/api/")
    .replaceAll("/api/v1", "/api/")
    .replaceAll("\\/api\\/v1", "\\/api")
    .replaceAll('https://orbitfs.cc', '${SITE_URL}')
    .replaceAll('https://www.orbitfs.cc', '${SITE_URL}')
    .replaceAll('new URL(req.url||"/","http://localhost")', 'new URL(req.url||"/",process.env.SITE_URL||"https://example.invalid")')
    .replaceAll('new URL(req.url || "/", "http://localhost")', 'new URL(req.url || "/", process.env.SITE_URL || "https://example.invalid")');

  // Admin HTML is served from the Master site, so all client-side API links are relative.
  if (file === "web/admin.html" || file === "web/admin-control.html") {
    next = next
      .replaceAll("Copy API base", "Copy API base")
      .replaceAll("location.origin+'/api/v1'", "location.origin+'/api'")
      .replaceAll("location.origin + '/api/v1'", "location.origin + '/api'")
      .replaceAll("value=\"https://incendiarynetworks.cc/api\"", "value=\"\"")
      .replaceAll("value=\"https://incendiarynetworks.cc/api/v1\"", "value=\"\"")
      .replaceAll('>Versioned API<', '>API base<')
      .replaceAll('Authority</b><span>incendiarynetworks.cc</span>', 'Authority</b><span id="authorityHost">—</span>');
  }

  // Release sources are fixed repository names; V1 is historical naming, not API versioning.
  if (file === "web/admin.html" || file === "web/admin-control.html") {
    next = next.replaceAll("V1-vercel-base / release-updates", "V1-vercel-base / base-release")
      .replaceAll("V1-vercel-base · release-updates", "V1-vercel-base · base-release")
      .replaceAll("Loading V1-vercel-base / release-updates", "Loading V1-vercel-base / base-release")
      .replaceAll("function sourceBranch(){return'release-updates'}", "function sourceBranch(mode){return mode==='base'?'base-release':'release-updates'}")
      .replaceAll("sourceBranch()", "sourceBranch('base')");
  }
  if (next !== source) writeFileSync(file, next);
}

const releaseControl = "api/release-control.ts";
if (existsSync(releaseControl)) {
  let source = readFileSync(releaseControl, "utf8");
  source = source.replaceAll("const input:Record<string,unknown>=await body(req);", "const input:Record<string,unknown>=await body(req) as Record<string,unknown>;");
  writeFileSync(releaseControl, source);
}

const server = "src/server.ts";
if (existsSync(server)) {
  let source = readFileSync(server, "utf8");
  source = source
    .replace('const installationMatch = path.match(/^\\/api\\/v1\\/installations(?:\\/([^/]+))?$/);', 'const installationMatch = path.match(/^\\/api\\/installations(?:\\/([^/]+))?$/);')
    .replace('const licenseControlMatch = path.match(/^\\/api\\/v1\\/license\\/([^/]+)\\/control$/);', 'const licenseControlMatch = path.match(/^\\/api\\/license\\/([^/]+)\\/control$/);')
    .replace('const releaseMatch = path.match(/^\\/api\\/v1\\/releases\\/([^/]+)\\/(artifact|validate|publish|pause|paused|withdraw|withdrawn|control)$/);', 'const releaseMatch = path.match(/^\\/api\\/releases\\/([^/]+)\\/(artifact|validate|publish|pause|paused|withdraw|withdrawn|control)$/);')
    .replace('const deploymentMatch = path.match(/^\\/api\\/v1\\/deployments(?:\\/([^/]+))?$/);', 'const deploymentMatch = path.match(/^\\/api\\/deployments(?:\\/([^/]+))?$/);');
  writeFileSync(server, source);
}

console.log("Canonical License Master API contract applied: SITE_URL + /api/*.");
