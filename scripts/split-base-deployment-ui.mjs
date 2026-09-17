import { readFileSync, writeFileSync } from 'node:fs';

const path = 'web/admin.html';
let html = readFileSync(path, 'utf8');
const marker = '/* ORBITFS_BASE_DEPLOYMENT_UI_V1 */';
if (!html.includes(marker)) {
  html = html.replace(
    '<button class="nav" data-v="deployments">Deployments</button>',
    '<button class="nav" data-v="base-deployment">Base Deployment</button>'
  );

  const deploymentStart = html.indexOf('<section id="deployments" class="view">');
  if (deploymentStart >= 0) {
    const deploymentEnd = html.indexOf('</section>', deploymentStart);
    if (deploymentEnd < 0) throw new Error('Deployments section closing tag not found');
    const replacement = '<section id="base-deployment" class="view"><div class="card"><h2>Base Deployment</h2><p class="sub">Simple Base deployment control. It always reads the latest <b>base-release</b> branch from <b>lucaskerim123/V1-vercel-base</b> and starts the Base deployment workflow.</p><div class="row" style="margin:16px 0"><button id="runBaseRelease" class="btn primary" style="width:auto" onclick="runBaseRelease()">Apply Latest Base</button><span id="baseReleaseRunMsg" class="sub">Ready.</span></div></div><div class="card"><h3>Latest Base Release</h3><div id="baseDeploymentLatest" class="sub">Loading…</div></div><div class="card"><h3>Recent Base Releases</h3><table class="table"><thead><tr><th>Version</th><th>Channel</th><th>Status</th><th>Source</th><th>Updated</th></tr></thead><tbody id="baseDeploymentBody"></tbody></table></div></section>';
    html = html.slice(0, deploymentStart) + replacement + html.slice(deploymentEnd + '</section>'.length);
  }

  html = html.replace(
    /<div class="row" style="margin:10px 0"><button id="runBaseRelease"[\s\S]*?<\/div>/,
    ''
  );

  html = html.replace('<h2>Release System</h2>', '<h2>Releases &amp; Updates</h2>');

  const script = `<script>${marker}\n(function(){\nasync function loadBaseDeployment(){try{const d=await admin('/releases');const rows=(d.releases||[]).filter(x=>String(x.component)==='orbitfs_base'||String(x.channel)==='base').sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));const latest=rows[0];const el=document.getElementById('baseDeploymentLatest');if(el)el.innerHTML=latest?'<b>v'+esc(latest.version||'—')+'</b> · '+esc(latest.status||'—')+' · '+esc(latest.source_commit||'').slice(0,12):'No Base releases have been ingested yet.';const body=document.getElementById('baseDeploymentBody');if(body)body.innerHTML=rows.slice(0,20).map(x=>'<tr><td>'+esc(x.version||'—')+'</td><td>'+esc(x.channel||'—')+'</td><td>'+esc(x.status||'—')+'</td><td>'+esc(x.source_commit||'').slice(0,12)+'</td><td>'+esc(x.updated_at||x.created_at||'—')+'</td></tr>').join('')||'<tr><td colspan="5">No Base releases.</td></tr>';}catch(e){const el=document.getElementById('baseDeploymentLatest');if(el)el.textContent=e.message}}\nconst oldShow=window.show;window.show=function(v){if(oldShow)oldShow(v);if(v==='base-deployment')setTimeout(loadBaseDeployment,0)};setTimeout(loadBaseDeployment,0);\n})();</script>`;
  html = html.replace('</body>', script + '</body>');
  writeFileSync(path, html);
}
