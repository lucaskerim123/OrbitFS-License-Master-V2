import { readFileSync, writeFileSync } from 'node:fs';

const htmlPath = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(htmlPath, 'utf8');

const settingsSection = `<section id="settings" class="view"><div class="card"><div class="row"><div style="flex:1"><h2>API Settings</h2><p class="sub">Internal License Master API control. These settings are stored by the Master itself. External systems use the API boundary; this panel does not depend on that boundary.</p></div><span id="settingsState" class="badge">Loading…</span></div><div class="grid"><div class="card"><h3>API Control</h3><div class="field"><label>API mode</label><select id="setMode"><option value="online">Online</option><option value="maintenance">Maintenance</option><option value="offline">Offline</option></select></div><div class="field"><label><input id="setEnabled" type="checkbox"> API enabled</label></div><div class="field"><label><input id="setGrace" type="checkbox"> Allow offline grace</label></div></div><div class="card"><h3>License Runtime</h3><div class="field"><label>Issuer</label><input id="setIssuer"></div><div class="field"><label>Audience</label><input id="setAudience"></div><div class="field"><label>Entitlement TTL (seconds)</label><input id="setTtl" type="number" min="60"></div><div class="field"><label>Grace period (seconds)</label><input id="setGraceSeconds" type="number" min="0"></div></div></div><div class="row"><button class="btn primary" style="width:auto" onclick="saveSettings()">Save Settings</button><button class="btn" style="width:auto" onclick="setApiMode('online')">Bring API Online</button><button class="btn warn" style="width:auto" onclick="setApiMode('maintenance')">Maintenance</button><button class="btn bad" style="width:auto" onclick="setApiMode('offline')">Take API Offline</button></div><p id="settingsMsg" class="sub"></p></div><div class="card"><h3>Current configuration</h3><pre id="settingsBody" class="key">Loading…</pre></div></section>`;
const productsSection = `<section id="products" class="view"><div class="card"><div class="row"><div style="flex:1"><h2>Products</h2><p class="sub">Canonical OrbitFS product catalogue owned by License Master. This is read from the Master database, not from the external API.</p></div><button class="btn" style="width:auto" onclick="loadProducts()">Refresh</button></div><table class="table"><thead><tr><th>Code</th><th>Name</th><th>Runtime</th><th>Status</th></tr></thead><tbody id="productsBody"></tbody></table><p id="productsMsg" class="sub"></p></div></section>`;

html = html.replace(/<section id="settings" class="view">.*?<\/section>/s, settingsSection);
html = html.replace(/<section id="products" class="view">.*?<\/section>/s, productsSection);

const jsMarker = '/* ORBITFS_MASTER_PANEL_V3 */';
if (!html.includes(jsMarker)) {
  const js = `\n${jsMarker}\nasync function loadProducts(){try{const d=await admin('/products');const rows=Array.isArray(d.products)?d.products:[];$('productsBody').innerHTML=rows.length?rows.map(x=>'<tr><td><code>'+esc(x.code||'')+'</code></td><td>'+esc(x.name||x.code||'—')+'</td><td>'+esc(x.component_key||x.runtime||x.code||'—')+'</td><td>'+badge(x.active===false?'inactive':'active')+'</td></tr>').join(''):'<tr><td colspan="4" class="sub">No products are configured in the License Master catalogue.</td></tr>'}catch(e){$('productsBody').innerHTML='<tr><td colspan="4">'+esc(e.message)+'</td></tr>'}}\nasync function loadSettings(){try{const d=await admin('/settings');const s=d.settings||{};const mode=['online','offline','maintenance'].includes(String(s.api_mode||'').toLowerCase())?String(s.api_mode).toLowerCase():'online';$('setMode').value=mode;$('setEnabled').checked=s.enabled!==false;$('setGrace').checked=s.allow_offline_grace!==false;$('setIssuer').value=s.issuer||'orbitfs-license-master';$('setAudience').value=s.audience||'orbitfs-runtime';$('setTtl').value=Number(s.entitlement_ttl_seconds||10800);$('setGraceSeconds').value=Number(s.grace_seconds||604800);$('settingsBody').textContent=JSON.stringify({...s,api_mode:mode},null,2);$('settingsState').textContent=s.enabled===false?'DISABLED':mode.toUpperCase();$('settingsState').className='badge '+(s.enabled===false||mode!=='online'?'warn':'')}catch(e){$('settingsMsg').textContent=e.message;$('settingsState').textContent='ERROR'}}\nasync function saveSettings(){try{$('settingsMsg').textContent='Saving to License Master…';await admin('/settings',{method:'POST',body:JSON.stringify({enabled:$('setEnabled').checked,api_mode:$('setMode').value,allow_offline_grace:$('setGrace').checked,issuer:$('setIssuer').value.trim(),audience:$('setAudience').value.trim(),entitlement_ttl_seconds:Number($('setTtl').value||10800),grace_seconds:Number($('setGraceSeconds').value||604800)})});$('settingsMsg').textContent='Settings saved in License Master.';await loadSettings()}catch(e){$('settingsMsg').textContent=e.message}}\nasync function setApiMode(mode){$('setMode').value=mode;$('setEnabled').checked=mode==='online';await saveSettings()}\n`;
  html = html.replace('</script>', js + '</script>');
}

const navOld = "if(v==='licenses')loadLicenses();if(v==='products')loadProducts();if(v==='settings')loadSettings();";
const navNew = "if(v==='licenses')loadLicenses();if(v==='products')loadProducts();if(v==='settings')loadSettings();";
html = html.replace(navOld, navNew);
writeFileSync(htmlPath, html);

const serverPath = new URL('../src/server.ts', import.meta.url);
let server = readFileSync(serverPath, 'utf8');
const marker = '    // ORBITFS_INTERNAL_MASTER_PANEL_V3';
if (!server.includes(marker)) {
  const routes = [
    marker,
    '    if (path === "/admin/settings" && req.method === "GET") {',
    '      await requireAdmin(req);',
    '      await query("create table if not exists master_license_settings (id text primary key, enabled boolean not null default true, issuer text not null default \'orbitfs-license-master\', audience text not null default \'orbitfs-runtime\', entitlement_ttl_seconds integer not null default 10800, grace_seconds integer not null default 604800, api_mode text not null default \'online\', allow_offline_grace boolean not null default true, revision bigint not null default 1, updated_at timestamptz not null default now())");',
    '      await query("insert into master_license_settings(id) values (\'primary\') on conflict (id) do nothing");',
    '      return json(res, 200, { settings: (await query<JsonObject>("select id,enabled,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at from master_license_settings where id=\'primary\' limit 1")).rows[0] || null });',
    '    }',
    '    if (path === "/admin/settings" && req.method === "POST") {',
    '      await requireAdmin(req);',
    '      const input = await body(req);',
    '      await query("create table if not exists master_license_settings (id text primary key, enabled boolean not null default true, issuer text not null default \'orbitfs-license-master\', audience text not null default \'orbitfs-runtime\', entitlement_ttl_seconds integer not null default 10800, grace_seconds integer not null default 604800, api_mode text not null default \'online\', allow_offline_grace boolean not null default true, revision bigint not null default 1, updated_at timestamptz not null default now())");',
    '      await query("insert into master_license_settings(id) values (\'primary\') on conflict (id) do nothing");',
    '      const current = (await query<JsonObject>("select * from master_license_settings where id=\'primary\' limit 1")).rows[0] || {};',
    '      const mode = String(input.api_mode ?? input.mode ?? current.api_mode ?? "online").toLowerCase();',
    '      if (!["online","offline","maintenance"].includes(mode)) return json(res, 400, { error: "api_mode must be online, offline, or maintenance" });',
    '      const enabled = input.enabled === undefined ? current.enabled !== false : Boolean(input.enabled);',
    '      const ttl = Math.max(60, Math.floor(Number(input.entitlement_ttl_seconds ?? current.entitlement_ttl_seconds ?? 10800)));',
    '      const grace = Math.max(0, Math.floor(Number(input.grace_seconds ?? current.grace_seconds ?? 604800)));',
    '      const issuer = String(input.issuer ?? current.issuer ?? "orbitfs-license-master").trim();',
    '      const audience = String(input.audience ?? current.audience ?? "orbitfs-runtime").trim();',
    '      if (!issuer || !audience || !Number.isFinite(ttl) || !Number.isFinite(grace)) return json(res, 400, { error: "Invalid License Master settings" });',
    '      const revision = Math.max(1, Math.floor(Number(current.revision || 0) + 1));',
    '      const settings = (await query<JsonObject>("update master_license_settings set enabled=$1,issuer=$2,audience=$3,entitlement_ttl_seconds=$4,grace_seconds=$5,api_mode=$6,allow_offline_grace=$7,revision=$8,updated_at=now() where id=\'primary\' returning id,enabled,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at", [enabled,issuer,audience,ttl,grace,mode,input.allow_offline_grace === undefined ? current.allow_offline_grace !== false : Boolean(input.allow_offline_grace),revision])).rows[0];',
    '      return json(res, 200, { ok: true, settings });',
    '    }',
    '    if (path === "/admin/products" && req.method === "GET") {',
    '      await requireAdmin(req);',
    '      return json(res, 200, { products: (await query<JsonObject>("select * from license_products order by sort_order asc, code asc limit 500")).rows });',
    '    }',
  ].join('\n') + '\n';
  const needle = '    if (path === "/api/admin/me" && req.method === "GET") {';
  if (!server.includes(needle)) throw new Error('server admin route insertion point not found');
  server = server.replace(needle, routes + needle);
  writeFileSync(serverPath, server);
}

console.log('Internal License Master panel settings and products ensured; external API remains an integration boundary.');

// This is deliberately the final UI normalization step. Earlier generators may add/replace
// the Releases/Deployments markup, so the requested two-page split must run after them.
await import('./finalize-release-deployment-pages.mjs');
