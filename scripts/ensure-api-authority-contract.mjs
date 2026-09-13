import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const roots = ["api", "src", "web", "tools", "docs", "scripts"];
const files = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path); else files.push(path);
  }
};
for (const root of roots) walk(root);

for (const file of files) {
  let source;
  try { source = readFileSync(file, "utf8"); } catch { continue; }
  let next = source
    .replaceAll("/api/v1/", "/api/")
    .replaceAll("/api/v1", "/api")
    .replaceAll("\\/api\\/v1", "\\/api")
    .replaceAll('new URL(req.url||"/","http://localhost")', 'new URL(req.url||"/",process.env.SITE_URL||"https://example.invalid")')
    .replaceAll('new URL(req.url || "/", "http://localhost")', 'new URL(req.url || "/", process.env.SITE_URL || "https://example.invalid")');

  if (file === "web/admin.html" || file === "web/admin-control.html") {
    next = next
      .replaceAll("location.origin+'/api/v1'", "location.origin+'/api'")
      .replaceAll("location.origin + '/api/v1'", "location.origin + '/api'")
      .replaceAll('value="https://incendiarynetworks.cc/api"', 'value=""')
      .replaceAll('value="https://incendiarynetworks.cc/api/v1"', 'value=""')
      .replaceAll('>Versioned API<', '>API base<')
      .replaceAll('Authority</b><span>incendiarynetworks.cc</span>', 'Authority</b><span id="authorityHost">—</span>')
      .replaceAll("V1-vercel-base / release-updates", "V1-vercel-base / base-release")
      .replaceAll("V1-vercel-base · release-updates", "V1-vercel-base · base-release")
      .replaceAll("Loading V1-vercel-base / release-updates", "Loading V1-vercel-base / base-release")
      .replaceAll("function sourceBranch(){return'release-updates'}", "function sourceBranch(mode){return mode==='base'?'base-release':'release-updates'}")
      .replaceAll("sourceBranch()", "sourceBranch('base')");
  }
  if (next !== source) writeFileSync(file, next);
}

console.log("Canonical License Master API contract applied: SITE_URL + /api/*.");
