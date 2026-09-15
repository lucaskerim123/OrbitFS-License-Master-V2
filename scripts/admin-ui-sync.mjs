import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(file, 'utf8');

html = html.replace(/<section id="products" class="view">.*?<\/section>/s, `<section id="products" class="view"><div class="card"><h2>Products</h2><p class="sub">Canonical licenses controlled by License Master.</p><table class="table"><thead><tr><th>License</th><th>Code</th><th>Component</th><th>Type</th><th>Status</th></tr></thead><tbody id="productsBody"></tbody></table></div></section>`);
html = html.replace(/<select id="product">.*?<\/select>/s, `<select id="product"><option value="orbitfs_base">OrbitFS Base</option><option value="orbitfs_mcp">OrbitFS MCP</option><option value="orbitfs_apex">OrbitFS APEX</option></select>`);

html = html.replace(/<section id="settings" class="view">.*?<\/section>/s, `<section id="settings" class="view"><div class="card"><div class="row"><div style="flex:1"><h2>API Settings</h2><p class="sub">Live License Master authority configuration. These values are stored and enforced by the Master service.</p></div><span id="settingsState" class="badge">Loading…</span></div><div class="grid"><div class="card"><h3>API Control</h3><div class="field"><label>API mode</label><select id="setMode"><option value="online">Online</option><option value="maintenance">Maintenance</option><option value="offline">Offline</option></select></div><div class="field"><label><input id="setEnabled" type="checkbox"> API enabled</label></div><div class="field"><label><input id="setGrace" type="checkbox"> Allow offline grace</label></div></div><div class="card"><h3>License Runtime</h3><div class="field"><label>Issuer</label><input id="setIssuer"></div><div class="field"><label>Audience</label><input id="setAudience"></div><div class="field"><label>Entitlement TTL (seconds)</label><input id="setTtl" type="number" min="60"></div><div class="field"><label>Grace period (seconds)</label><input id="setGraceSeconds" type="number" min="0"></div></div></div><div class="row"><button class="btn primary" style="width:auto" onclick="saveSettings()">Save Settings</button><button class="btn" style="width:auto" onclick="setApiMode('online')">Bring API Online</button><button class="btn warn" style="width:auto" onclick="setApiMode('maintenance')">Maintenance</button><button class="btn bad" style="width:auto" onclick="setApiMode('offline')">Offline</button></div><p id="settingsMsg" class="sub"></p></div><div class="card"><h3>Current configuration</h3><pre id="settingsBody" class="key">Loading…</pre></div></section>`);

const navOld = "if(v==='releases')loadReleases();if(v==='settings')loadSettings();if(v==='deployments')loadAll();";
const navNew = "if(v==='releases')loadReleases();if(v==='settings')loadSettings();if(v==='products')loadProducts();if(v==='deployments')loadAll();";
html = html.replace(navOld, navNew);

const marker = '</script>';
if (!html.includes('function renderCanonicalProducts(')) {
  const js = `
function renderCanonicalProducts(rows){const allowed=['orbitfs_base','orbitfs_mcp','orbitfs_apex'];const data=rows.filter(x=>allowed.includes(String(x.code)));$('productsBody').innerHTML=data.length?data.map(x=>'<tr><td><b>'+esc(x.name||x.code)+'</b></td><td>'+esc(x.code)+'</td><td>'+esc(x.component_key||x.code)+'</td><td>'+esc(x.product_type||'license')+'</td><td>'+badge(x.active===false?'inactive':'active')+'</td></tr>').join(''):'<tr><td colspan="5" class="sub">No canonical products configured.</td></tr>'}
async function loadProducts(){try{const d=await api('/api/admin/products');renderCanonicalProducts(d.products||[])}catch(e){$('productsBody').innerHTML='<tr><td colspan="5" class="sub">'+esc(e.message)+'</td></tr>'}}
async function loadSettings(){try{const d=await api('/api/admin/settings');const s=d.settings||{};$('setMode').value=s.api_mode||'online';$('setEnabled').checked=s.enabled!==false;$('setGrace').checked=s.allow_offline_grace!==false;$('setIssuer').value=s.issuer||'orbitfs-license-master';$('setAudience').value=s.audience||'orbitfs-runtime';$('setTtl').value=Number(s.entitlement_ttl_seconds||86400);$('setGraceSeconds').value=Number(s.grace_seconds||172800);$('settingsBody').textContent=JSON.stringify(s,null,2);$('settingsState').textContent=(s.enabled===false?'DISABLED':String(s.api_mode||'online').toUpperCase());}catch(e){$('settingsMsg').textContent=e.message}}
async function saveSettings(){try{await api('/api/admin/settings',{method:'POST',body:JSON.stringify({enabled:$('setEnabled').checked,api_mode:$('setMode').value,allow_offline_grace:$('setGrace').checked,issuer:$('setIssuer').value.trim(),audience:$('setAudience').value.trim(),entitlement_ttl_seconds:Number($('setTtl').value||86400),grace_seconds:Number($('setGraceSeconds').value||172800)})});$('settingsMsg').textContent='Settings saved.';await loadSettings()}catch(e){$('settingsMsg').textContent=e.message}}
async function setApiMode(mode){$('setMode').value=mode;$('setEnabled').checked=mode==='online';await saveSettings()}
`;
  html = html.replace(marker, js + marker);
}

writeFileSync(file, html);
