import { readFileSync, writeFileSync } from 'node:fs';

const htmlPath = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(htmlPath, 'utf8');

// The Base source is the release branch, never the old release-updates branch.
html = html.replace(
  'Base deployment: <b>lucaskerim123/V1-vercel-base</b> / <b>release-updates</b>.',
  'Base release source: <b>lucaskerim123/V1-vercel-base</b> / <b>base-release</b>.'
);

const releaseHeading = '<section id="releases" class="view"><div class="card"><h2>Release System</h2>';
if (html.includes(releaseHeading) && !html.includes('id="runBaseRelease"')) {
  html = html.replace(
    releaseHeading,
    releaseHeading + '<div class="row" style="margin:10px 0"><button id="runBaseRelease" class="btn primary" style="width:auto" onclick="runBaseRelease()">Run Base Release</button><span id="baseReleaseRunMsg" class="sub">Manual only — nothing runs until you click this.</span></div>'
  );
}

if (!html.includes('async function runBaseRelease(){')) {
  const insertAt = html.indexOf('</script>');
  if (insertAt < 0) throw new Error('Admin UI script marker not found');
  const js = `\nasync function runBaseRelease(){try{const button=$('runBaseRelease');const msg=$('baseReleaseRunMsg');if(button)button.disabled=true;if(msg)msg.textContent='Starting Base release from base-release…';const d=await api('/api/admin/releases/base-release/run',{method:'POST',body:'{}'});if(msg)msg.textContent='Base release queued: '+(d.version||'unknown')+' · '+(d.sourceSha||'').slice(0,12);setTimeout(loadReleases,4000);setTimeout(loadReleases,10000);setTimeout(loadReleases,20000)}catch(e){const msg=$('baseReleaseRunMsg');if(msg)msg.textContent=e.message;alert(e.message)}finally{const button=$('runBaseRelease');if(button)button.disabled=false}}\n`;
  html = html.slice(0, insertAt) + js + html.slice(insertAt);
}

writeFileSync(htmlPath, html);

const serverPath = new URL('../src/server.ts', import.meta.url);
let server = readFileSync(serverPath, 'utf8');
const marker = '    // MANUAL_BASE_RELEASE_UI_V1';
if (!server.includes(marker)) {
  const anchor = '    const deploymentMatch = path.match(/^\\/api\\/deployments(?:\\/([^/]+))?$/);';
  const at = server.indexOf(anchor);
  if (at < 0) throw new Error('Server deployment route anchor not found');
  const route = `    ${marker}\n    if (path === "/api/admin/releases/base-release/run" && req.method === "POST") {\n      await requireAdmin(req);\n      const githubToken = String(process.env.GITHUB_TOKEN || process.env.RELEASE_GITHUB_TOKEN || "").trim();\n      if (!githubToken) return json(res, 503, { error: "GitHub release control is not configured. Set GITHUB_TOKEN on License Master." });\n      const sourceRepo = "lucaskerim123/V1-vercel-base";\n      const sourceBranch = "base-release";\n      const headers = { Authorization: ["Bearer", githubToken].join(" "), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };\n      const branchResponse = await fetch(\`https://api.github.com/repos/\${sourceRepo}/branches/\${sourceBranch}\`, { headers });\n      if (!branchResponse.ok) return json(res, 502, { error: \`Unable to read Base release branch from GitHub (\${branchResponse.status})\` });\n      const branch = await branchResponse.json() as JsonObject;\n      const sourceSha = String((branch.commit as JsonObject | undefined)?.sha || "");\n      if (!/^[0-9a-f]{40}$/.test(sourceSha)) return json(res, 502, { error: "GitHub returned an invalid Base release commit SHA" });\n      const packageResponse = await fetch(\`https://raw.githubusercontent.com/\${sourceRepo}/\${sourceBranch}/package.json\`, { headers });\n      if (!packageResponse.ok) return json(res, 502, { error: \`Unable to read Base package version (\${packageResponse.status})\` });\n      const packageJson = await packageResponse.json() as JsonObject;\n      const version = String(packageJson.version || "").trim();\n      if (!/^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$/.test(version)) return json(res, 502, { error: "Base package.json does not contain a valid SemVer version" });\n      const dispatchResponse = await fetch("https://api.github.com/repos/lucaskerim123/OrbitFS-License-Master-V2/actions/workflows/release-master.yml/dispatches", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main", inputs: { source_repo: sourceRepo, source_branch: sourceBranch, source_sha: sourceSha, version } }) });\n      if (!dispatchResponse.ok) { const detail = await dispatchResponse.text(); return json(res, 502, { error: \`Unable to start Base release workflow (\${dispatchResponse.status})\`, detail: detail.slice(0, 1000) }); }\n      await audit("release", sourceSha, "base_release_workflow_started", actorFrom(req), { sourceRepo, sourceBranch, sourceSha, version, manual: true });\n      return json(res, 202, { ok: true, queued: true, version, sourceRepo, sourceBranch, sourceSha });\n    }\n`;
  server = server.slice(0, at) + route + server.slice(at);
  writeFileSync(serverPath, server);
}
