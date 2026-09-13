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
  const next = source
    .replaceAll("/api/v1/", "/api/")
    .replaceAll("\\/api\\/v1", "\\/api")
    .replaceAll('new URL(req.url||"/","http://localhost")', 'new URL(req.url||"/",process.env.SITE_URL||"https://example.invalid")')
    .replaceAll('new URL(req.url || "/", "http://localhost")', 'new URL(req.url || "/", process.env.SITE_URL || "https://example.invalid")');
  if (next !== source) writeFileSync(file, next);
}

const releaseUi = "web/admin.html";
if (existsSync(releaseUi)) {
  let source = readFileSync(releaseUi, "utf8");
  source = source.replaceAll("V1-vercel-base / release-updates", "V1-vercel-base / base-release")
    .replaceAll("V1-vercel-base · release-updates", "V1-vercel-base · base-release")
    .replaceAll("Loading V1-vercel-base / release-updates", "Loading V1-vercel-base / base-release");
  writeFileSync(releaseUi, source);
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
  const projectCreate = '    if (!project) project = await vapi("/v11/projects", { method: "POST", body: JSON.stringify({ name: projectName, framework: "sveltekit" }) });';
  if (source.includes(projectCreate) && !source.includes("const activeProject=project")) {
    source = source.replace(projectCreate, `${projectCreate}\n    if (!project) throw new Error("Unable to create Vercel project");\n    const activeProject=project;`)
      .replaceAll("encodeURIComponent(project.id)", "encodeURIComponent(activeProject.id)")
      .replaceAll("name: project.name, project: project.id", "name: activeProject.name, project: activeProject.id")
      .replaceAll("projectName: project.name", "projectName: activeProject.name");
  }
  writeFileSync(server, source);
}

console.log("Canonical License Master API contract applied: SITE_URL + /api/*.");
