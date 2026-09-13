import { readFileSync, writeFileSync } from "node:fs";

const replaceIn = (file, replacements) => {
  let source = readFileSync(file, "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  writeFileSync(file, source);
};

// OrbitFS uses one canonical public API surface: /api/*.
// Supabase's own /auth/v1/* paths are intentionally not touched.
for (const file of [
  "src/server.ts",
  "api/[...path].ts",
  "api/admin-control-ui.ts",
  "api/admin-extended.ts",
  "api/admin-release-ui.ts",
  "api/admin.ts",
  "api/admin-settings.ts",
  "api/products.ts",
  "api/release-capture.ts",
  "api/release-control.ts",
  "web/admin.html",
  "web/admin-control.html",
  "tools/api-layout-patch.py",
  "tools/apply-product-api-patch.mjs",
]) {
  try { replaceIn(file, [["/api/v1/", "/api/"]]); } catch {}
}

const adminFile = "api/admin-extended.ts";
let adminSource = readFileSync(adminFile, "utf8");
adminSource = adminSource.replaceAll('"http://localhost"', 'process.env.SITE_URL||"https://orbitfs.cc"');
adminSource = adminSource.replaceAll('new URL(req.url || "/", "http://localhost")', 'new URL(req.url || "/", process.env.SITE_URL || "https://orbitfs.cc")');
writeFileSync(adminFile, adminSource);

for (const file of ["api/products.ts", "api/release-control.ts"]) {
  let source = readFileSync(file, "utf8");
  source = source.replaceAll('"http://localhost"', 'process.env.SITE_URL||"https://orbitfs.cc"');
  writeFileSync(file, source);
}

// The two release sources are fixed authoritative sources; no repository/branch
// environment variables are required.
const releaseBase = "lucaskerim123/V1-vercel-base";
const releaseBaseBranch = "base-release";
const releaseUpdates = "lucaskerim123/V1-vercel-engine";
const releaseUpdatesBranch = "release-updates";

const patchReleaseSource = (file) => {
  let source = readFileSync(file, "utf8");
  source = source.replace(/const RELEASE_BASE_REPOSITORY[^;]*;\n?/g, "")
    .replace(/const RELEASE_BASE_BRANCH[^;]*;\n?/g, "")
    .replace(/const RELEASE_UPDATE_REPOSITORY[^;]*;\n?/g, "")
    .replace(/const RELEASE_UPDATE_BRANCH[^;]*;\n?/g, "");
  source = source.replace(/const SITE_URL[^;]*;\n?/g, "");
  source = source.replace(/const base = kind === "base"; const repo = base \? [^;]+; const branch = base \? [^;]+;/,
    `const base = kind === "base"; const repo = base ? "${releaseBase}" : "${releaseUpdates}"; const branch = base ? "${releaseBaseBranch}" : "${releaseUpdatesBranch}";`);
  source = source.replace(/const repo=kind==="base"\?[^;]+;const branch=kind==="base"\?[^;]+;/,
    `const repo=kind==="base"?"${releaseBase}":"${releaseUpdates}";const branch=kind==="base"?"${releaseBaseBranch}":"${releaseUpdatesBranch}";`);
  source = source.replaceAll("orbitfs-panel-release-v1", "orbitfs-panel-release")
    .replaceAll("orbitfs-engine-release-v1", "orbitfs-engine-release");
  writeFileSync(file, source);
};
patchReleaseSource("api/admin-extended.ts");
patchReleaseSource("api/release-capture.ts");

const uiFile = "web/admin.html";
let uiSource = readFileSync(uiFile, "utf8");
uiSource = uiSource.replaceAll("ext('settings')", "api('/api/admin-settings')");
uiSource = uiSource.replaceAll("incendiarynetworks.cc", "orbitfs.cc");
uiSource = uiSource.replaceAll("V1-vercel-base · release-updates", "V1-vercel-base · base-release");
uiSource = uiSource.replaceAll("V1-vercel-base / release-updates", "V1-vercel-base / base-release");
uiSource = uiSource.replace("function sourceBranch(){return'release-updates'}", "function sourceBranch(mode){return mode==='base'?'base-release':'release-updates'}");
uiSource = uiSource.replaceAll("sourceRepo(mode)+' / '+sourceBranch()", "sourceRepo(mode)+' / '+sourceBranch(mode)");
writeFileSync(uiFile, uiSource);

const controlUi = "web/admin-control.html";
let controlSource = readFileSync(controlUi, "utf8");
controlSource = controlSource.replaceAll("incendiarynetworks.cc", "orbitfs.cc");
controlSource = controlSource.replaceAll("/api/v1", "/api");
controlSource = controlSource.replaceAll("ext('settings')", "fetch('/api/admin-settings',{headers:{authorization:'Bearer '+sessionStorage.getItem('orbitfs_admin_access_token')}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Unable to load settings');return d})");
// Never expose a GitHub token or read the wrong repository/branch from the browser.
controlSource = controlSource.replace(/async function loadReleaseSources\(\)\{.*?\n\}/s,
  `async function loadReleaseSources(){try{const get=async kind=>{const r=await fetch('/api/admin-extended?action=releaseSource&kind='+encodeURIComponent(kind),{headers:{authorization:'Bearer '+sessionStorage.getItem('orbitfs_admin_access_token'),'x-release-kind':kind}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Unable to read release source');return d.source};const [base,update]=await Promise.all([get('base'),get('update')]);$('releaseSources').innerHTML='<div class="source-chip"><b>Base / clean installation</b><span>'+esc(base.repo)+' · branch: '+esc(base.branch)+' · commit: '+esc(base.shortSha)+' · '+esc(base.message)+'</span></div><div class="source-chip"><b>Updates / existing installations</b><span>'+esc(update.repo)+' · branch: '+esc(update.branch)+' · commit: '+esc(update.shortSha)+' · '+esc(update.message)+'</span></div>';}catch(e){$('releaseSources').innerHTML='<div class="source-chip"><b>Release source unavailable</b><span>'+esc(e.message)+'</span></div>';}}`);
writeFileSync(controlUi, controlSource);

const envFile = ".env.example";
let env = readFileSync(envFile, "utf8");
env = env.replaceAll("https://incendiarynetworks.cc", "https://orbitfs.cc")
  .replaceAll("https://www.orbitfs.cc", "https://orbitfs.cc")
  .replace(/LICENSE_API_BASE_URL=.*/g, "LICENSE_API_BASE_URL=https://orbitfs.cc/api");
env = env.split("\n").filter(line => !/^RELEASE_(BASE|UPDATE)_/.test(line)).join("\n");
writeFileSync(envFile, env);

console.log("OrbitFS License Master build contract enforced: canonical /api API, fixed release sources, production URL, and dedicated settings endpoint");
