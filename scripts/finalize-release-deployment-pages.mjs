import { readFileSync, writeFileSync } from 'node:fs';

const path = 'web/admin.html';
let html = readFileSync(path, 'utf8');
const marker = '/* ORBITFS_RELEASE_DEPLOYMENT_PAGES_V2 */';

// Replace the combined release/deployment navigation with the two requested admin pages.
html = html.replace(
  /<button class="nav" data-v="releases">Releases<\/button><button class="nav" data-v="deployments">Deployments<\/button>/,
  '<button class="nav" data-v="base-deployment">Base Deployment</button><button class="nav" data-v="releases">Releases &amp; Updates</button>'
);

// Remove the old customer/installation deployment page from the admin navigation if it survives in another form.
html = html.replace(/<button class="nav" data-v="deployments">Deployments<\/button>/g, '');

const deploymentStart = html.indexOf('<section id="deployments" class="view">');
if (deploymentStart >= 0) {
  const deploymentEnd = html.indexOf('</section>', deploymentStart);
  if (deploymentEnd >= 0) html = html.slice(0, deploymentStart) + html.slice(deploymentEnd + '</section>'.length);
}

const releasesStart = html.indexOf('<section id="releases" class="view">');
if (releasesStart >= 0) {
  const releasesEnd = html.indexOf('</section>', releasesStart);
  if (releasesEnd >= 0) {
    const releaseSection = html.slice(releasesStart, releasesEnd + '</section>'.length);
    if (releaseSection.includes('<h2>Release System</h2>')) {
      const replacement = '<section id="releases" class="view"><div class="card"><div class="row"><h2 style="flex:1">Releases &amp; Updates</h2><span class="badge">System 1</span></div><p class="sub">Version control for OrbitFS updates. Base deployment is intentionally handled on its own page.</p><div class="card"><h3>Update Releases</h3><div id="updateReleases"></div></div></div><div class="card"><h3>Create Update Draft</h3><div class="grid"><div class="field"><label>Version</label><input id="releaseVersion" placeholder="2.0.1"></div><div class="field"><label>Title</label><input id="releaseTitle"></div><div class="field"><label>Source commit</label><input id="releaseCommit"></div></div><div class="field"><label>Changelog</label><textarea id="releaseChangelog"></textarea></div><button class="btn primary" style="width:auto" onclick="createUpdateRelease()">Create Update Draft</button><p id="releaseMsg" class="sub"></p></div></section>';
      html = html.slice(0, releasesStart) + replacement + html.slice(releasesEnd + '</section>'.length);
    }
  }
}

const basePage = '<section id="base-deployment" class="view"><div class="card"><div class="row"><h2 style="flex:1">Base Deployment</h2><span class="badge">OrbitFS Base</span></div><p class="sub">Simple administrator deployment control. This page uses the latest <b>base-release</b> from <b>lucaskerim123/V1-vercel-base</b>. Detailed version control, release validation and rollback belong on Releases &amp; Updates.</p><div class="row" style="margin:16px 0"><button id="runBaseRelease" class="btn primary" style="width:auto" onclick="runBaseRelease()">Apply Latest Base</button><span id="baseReleaseRunMsg" class="sub">Ready.</span></div></div><div class="card"><h3>Latest Base Release</h3><div id="baseDeploymentLatest" class="sub">Loading…</div></div><div class="card"><h3>Base Release History</h3><table class="table"><thead><tr><th>Version</th><th>Channel</th><th>Status</th><th>Source</th><th>Updated</th></tr></thead><tbody id="baseDeploymentBody"></tbody></table></div></section>';

if (!html.includes('id="base-deployment"')) {
  const anchor = '<section id="installations" class="view">';
  const at = html.indexOf(anchor);
  if (at < 0) throw new Error('Installations section anchor not found');
  html = html.slice(0, at) + basePage + html.slice(at);
}

// Ensure the old release JS cannot try to populate a removed Base panel.
const oldLoad = "if(v==='releases')loadReleases();if(v==='deployments')loadDeployments();if(v==='installations')loadInstallations()";
const newLoad = "if(v==='base-deployment')loadBaseDeployment();if(v==='releases')loadReleases();if(v==='installations')loadInstallations()";
html = html.replace(oldLoad, newLoad);

const script = `<script>${marker}\nasync function loadBaseDeployment(){try{const d=await admin('/releases');const rows=(d.releases||[]).filter(x=>String(x.component)==='orbitfs_base'||String(x.channel)==='base').sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));const latest=rows[0];const el=$('baseDeploymentLatest');if(el)el.innerHTML=latest?'<b>v'+esc(latest.version||'—')+'</b> · '+esc(latest.status||'—')+' · '+esc(latest.source_commit||'').slice(0,12):'No Base releases have been ingested yet.';const body=$('baseDeploymentBody');if(body)body.innerHTML=rows.slice(0,30).map(x=>'<tr><td>'+esc(x.version||'—')+'</td><td>'+esc(x.channel||'—')+'</td><td>'+esc(x.status||'—')+'</td><td>'+esc(x.source_commit||'').slice(0,12)+'</td><td>'+esc(x.updated_at||x.created_at||'—')+'</td></tr>').join('')||'<tr><td colspan="5">No Base releases.</td></tr>';}catch(e){const el=$('baseDeploymentLatest');if(el)el.textContent=e.message}}\nasync function runBaseRelease(){const b=$('runBaseRelease'),m=$('baseReleaseRunMsg');try{if(b)b.disabled=true;if(m)m.textContent='Reading latest base-release…';const d=await fetch('/api/admin/releases/base-release/run',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'});const out=await d.json().catch(()=>({}));if(!d.ok)throw Error(out.error||out.message||'Unable to start Base deployment');if(m)m.textContent='Base deployment queued · v'+(out.version||'unknown')+' · '+String(out.sourceSha||'').slice(0,12);setTimeout(loadBaseDeployment,4000);setTimeout(loadBaseDeployment,10000);}catch(e){if(m)m.textContent=e.message}finally{if(b)b.disabled=false}}\nasync function createUpdateRelease(){try{const v=$('releaseVersion').value.trim();if(!v)throw Error('Version is required');await admin('/releases',{method:'POST',body:JSON.stringify({component:'orbitfs_mcp',channel:'update',version:v,title:$('releaseTitle').value,changelog:$('releaseChangelog').value,sourceCommit:$('releaseCommit').value})});$('releaseMsg').textContent='Update draft created.';loadReleases()}catch(e){$('releaseMsg').textContent=e.message}}\n</script>`;
if (!html.includes(marker)) html = html.replace('</body>', script + '</body>');

writeFileSync(path, html);
console.log('OrbitFS admin UI finalized: Base Deployment and Releases & Updates are separate pages.');
