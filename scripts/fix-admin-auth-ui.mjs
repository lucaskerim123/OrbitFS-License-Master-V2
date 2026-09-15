import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(path, 'utf8');

const oldStart = `async function start(){try{await api('/api/admin/license-master');$('login').classList.add('hidden');$('app').classList.remove('hidden');await loadStatus()}catch(e){sessionStorage.removeItem(tokenKey);token='';$('login').classList.remove('hidden');$('app').classList.add('hidden');$('loginError').textContent=e.message}}`;
const newStart = `async function start(){
  if(!token){$('login').classList.remove('hidden');$('app').classList.add('hidden');return}
  $('login').classList.add('hidden');$('app').classList.remove('hidden');
  await loadStatus();
}`;
if (html.includes(oldStart)) html = html.replace(oldStart, newStart);

const productOld = `<div class="field"><label>Product</label><select id="product"><option value="orbitfs_base">OrbitFS Base</option><option value="orbitfs_mcp">OrbitFS MCP</option><option value="orbitfs_apex">OrbitFS APEX</option><option value="orbitfs_studio">OrbitFS Studio</option></select></div>`;
const productNew = `<div class="field"><label>License components</label><div class="product-grid"><label class="product-card required"><input type="checkbox" checked disabled><span><b>OrbitFS Base</b><small>Main license — always included</small></span><em>Required</em></label><label class="product-card"><input class="addon" name="addon" value="orbitfs_mcp" type="checkbox"><span><b>MCP</b><small>Model Context Protocol addon</small></span></label><label class="product-card"><input class="addon" name="addon" value="orbitfs_apex" type="checkbox"><span><b>APEX</b><small>APEX addon</small></span></label><label class="product-card"><input class="addon" name="addon" value="orbitfs_studio" type="checkbox"><span><b>Studio</b><small>Studio addon</small></span></label></div></div>`;
if (html.includes(productOld)) html = html.replace(productOld, productNew);

const issueStart = html.indexOf('async function issueLicense(){');
const issueEnd = html.indexOf('async function control(', issueStart);
if (issueStart >= 0 && issueEnd > issueStart) {
  const issueFn = `async function issueLicense(){try{$('issueMsg').textContent='Creating…';const orderRef=$('orderRef').value.trim();if(!orderRef)throw Error('Order reference is required');const components={orbitfs_base:true,orbitfs_mcp:false,orbitfs_apex:false,orbitfs_studio:false};document.querySelectorAll('input[name="addon"]:checked').forEach(x=>{components[x.value]=true});const adminOverride=orderRef.toUpperCase()==='ADMIN';const input={orderRef,customerRef:$('customerRef').value.trim(),productCode:'orbitfs_base',components,maxInstallations:Number($('maxInstalls').value||1)};if($('expiry').value)input.expiresAt=new Date($('expiry').value).toISOString();const metadata={...(adminOverride?{adminOverride:true,issuedBy:'admin'}:{}),...($('notes').value.trim()?{notes:$('notes').value.trim()}: {})};if(Object.keys(metadata).length)input.metadata=metadata;const d=await api('/api/admin/licenses/issue',{method:'POST',body:JSON.stringify(input)});$('issueResult').innerHTML='<div class="key">'+esc(d.licenceKey||d.licenseKey||'License issued; key not returned')+'</div>';$('issueMsg').textContent=adminOverride?'ADMIN override: license created with selected components.':'License created by License Master.';await loadAll()}catch(e){$('issueMsg').textContent=e.message}}\n`;
  html = html.slice(0, issueStart) + issueFn + html.slice(issueEnd);
}

const productCss = `.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.product-card{display:flex;align-items:center;gap:9px;padding:11px;border:1px solid #30415c;background:#0a1423;border-radius:8px;cursor:pointer}.product-card input{width:auto}.product-card span{display:flex;flex-direction:column;gap:2px;flex:1}.product-card small{color:#8290a7;font-size:11px}.product-card em{font-style:normal;color:#8d98aa;font-size:10px}.product-card.required{border-color:#4d4be9}@media(max-width:760px){.product-grid{grid-template-columns:1fr}}`;
if (!html.includes('.product-grid{')) html = html.replace('</style>', productCss + '</style>');

const serverPath = new URL('../src/server.ts', import.meta.url);
let server = readFileSync(serverPath, 'utf8');
const marker = '    // CANONICAL_ADMIN_ROUTES_V2';
if (!server.includes(marker)) {
  const adminRoutes = [
    marker,
    '    if (path === "/api/admin/settings" && req.method === "GET") {',
    '      await requireAdmin(req);',
    '      return json(res, 200, { settings: (await query<JsonObject>("select * from master_license_settings where id=\'primary\' limit 1")).rows[0] || null });',
    '    }',
    '    if (path === "/api/admin/products" && req.method === "GET") {',
    '      await requireAdmin(req);',
    '      return json(res, 200, { products: (await query<JsonObject>("select * from license_products order by code asc limit 500")).rows });',
    '    }',
    '    if (path === "/api/admin/installations" && req.method === "GET") {',
    '      await requireAdmin(req);',
    '      return json(res, 200, { installations: (await query<JsonObject>("select * from orbitfs_installations order by updated_at desc limit 500")).rows });',
    '    }',
    '    if (path === "/api/admin/deployments" && req.method === "GET") {',
    '      await requireAdmin(req);',
    '      return json(res, 200, { jobs: (await query<JsonObject>("select * from deployment_jobs order by created_at desc limit 200")).rows });',
    '    }',
    '    if (path === "/api/admin/releases" && req.method === "GET") {',
    '      await requireAdmin(req);',
    '      return releases(req, res, true);',
    '    }',
    '    if (path === "/api/admin/releases" && req.method === "POST") {',
    '      await requireAdmin(req);',
    '      const input = await body(req);',
    '      const component = String(input.component || "orbitfs_base");',
    '      const channel = String(input.channel || (component === "orbitfs_base" ? "base" : "update"));',
    '      const version = String(input.version || "").trim();',
    '      if (!version) return json(res, 400, { error: "Version is required" });',
    '      const existing = (await query<JsonObject>("select * from releases where component=$1 and channel=$2 and version=$3 limit 1", [component, channel, version])).rows[0];',
    '      if (existing) return json(res, 200, { release: existing, idempotent: true });',
    '      const title = String(input.title || ("OrbitFS " + version));',
    '      const release = (await query<JsonObject>("insert into releases (id,component,version,channel,status,title,description,changelog,customer_notes,internal_notes,severity,required,rollout,minimum_version,rollback_version,schema_version,checkpoint_required,components,manifest,permissions,compatibility,source_commit) values(gen_random_uuid(),$1,$2,$3,\'draft\',$4,\'\',$5,\'\',\'\',$6,false,\'internal\',null,null,\'1\',false,$7,\'{}\',\'{}\',\'{}\',$8) returning *", [component, version, channel, title, String(input.changelog || ""), String(input.severity || "normal"), input.components || [], input.sourceCommit || null])).rows[0];',
    '      return json(res, 201, { release });',
    '    }',
    '    const adminReleaseAction = path.match(/^\\/api\\/admin\\/releases\\/([^/]+)\\/(validate|publish|pause|withdraw)$/);',
    '    if (adminReleaseAction && req.method === "POST") {',
    '      await requireAdmin(req);',
    '      const id = decodeURIComponent(adminReleaseAction[1]);',
    '      const action = adminReleaseAction[2];',
    '      const row = (await query<JsonObject>("select * from releases where id=$1", [id])).rows[0];',
    '      if (!row) return json(res, 404, { error: "Release not found" });',
    '      if (action === "validate") await query("update releases set status=\'validated\',updated_at=now() where id=$1", [id]);',
    '      else if (action === "publish") {',
    '        if (row.status !== "validated") return json(res, 409, { error: "Release must be validated before publishing" });',
    '        await query("update releases set status=\'published\',published_at=now(),published_by=\'admin\',updated_at=now() where id=$1", [id]);',
    '      } else await query("update releases set status=$1,updated_at=now() where id=$2", [action === "pause" ? "paused" : "withdrawn", id]);',
    '      return json(res, 200, { ok: true, release: (await query<JsonObject>("select * from releases where id=$1", [id])).rows[0] });',
    '    }',
  ].join('\n') + '\n';
  const needle = '    return json(res, 404, { error: "Not found" });';
  if (!server.includes(needle)) throw new Error('server route insertion point not found');
  server = server.replace(needle, adminRoutes + needle);
  writeFileSync(serverPath, server);
}

for (const file of ['../src/server.ts', '../src/new-api-authority.ts']) {
  const target = new URL(file, import.meta.url);
  let source = readFileSync(target, 'utf8');
  const oldSql = `values($1,$2,$3,'fulfilled',$4,$4,now(),$5) on conflict(order_ref) do nothing`;
  const newSql = `values($1,$2,$3,'fulfilled',$4,$5,now(),$6) on conflict(order_ref) do nothing`;
  if (source.includes(oldSql)) {
    source = source.replace(oldSql, newSql);
    const oldArgs = `[orderRef, String(input.customerRef || ""), String(input.productCode || "orbitfs_base"), binding.id, { components }]`;
    const newArgs = `[orderRef, String(input.customerRef || ""), String(input.productCode || "orbitfs_base"), binding.id, String(binding.id), { components }]`;
    if (source.includes(oldArgs)) source = source.replace(oldArgs, newArgs);
    writeFileSync(target, source);
  }
}

writeFileSync(path, html);
console.log('Admin UI, canonical admin routes, licensing issuance, and PostgreSQL parameter handling normalized.');
