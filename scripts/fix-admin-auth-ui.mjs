import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(path, 'utf8');

const old = `async function start(){try{await api('/api/admin/license-master');$('login').classList.add('hidden');$('app').classList.remove('hidden');await loadStatus()}catch(e){sessionStorage.removeItem(tokenKey);token='';$('login').classList.remove('hidden');$('app').classList.add('hidden');$('loginError').textContent=e.message}}`;
const next = `async function start(){
  if(!token){$('login').classList.remove('hidden');$('app').classList.add('hidden');return}
  $('login').classList.add('hidden');$('app').classList.remove('hidden');
  await loadStatus();
}`;
if (html.includes(old)) html = html.replace(old, next);

const settingsOld = `api('/api/admin/settings')`;
if (html.includes(settingsOld)) html = html.replaceAll(settingsOld, `api('/api/admin/settings')`);

const productOld = `<div class="field"><label>Product</label><select id="product"><option value="orbitfs_base">OrbitFS Base</option><option value="orbitfs_mcp">OrbitFS MCP</option><option value="orbitfs_apex">OrbitFS APEX</option><option value="orbitfs_studio">OrbitFS Studio</option></select></div>`;
const productNew = `<div class="field"><label>License components</label><div class="product-grid"><label class="product-card required"><input type="checkbox" checked disabled><span><b>OrbitFS Base</b><small>Main license — always included</small></span><em>Required</em></label><label class="product-card"><input class="addon" name="addon" value="orbitfs_mcp" type="checkbox"><span><b>MCP</b><small>Model Context Protocol addon</small></span></label><label class="product-card"><input class="addon" name="addon" value="orbitfs_apex" type="checkbox"><span><b>APEX</b><small>APEX addon</small></span></label><label class="product-card"><input class="addon" name="addon" value="orbitfs_studio" type="checkbox"><span><b>Studio</b><small>Studio addon</small></span></label></div></div>`;
if (html.includes(productOld)) html = html.replace(productOld, productNew);

const issueStart = html.indexOf('async function issueLicense(){');
const issueEnd = html.indexOf('async function control(', issueStart);
if (issueStart >= 0 && issueEnd > issueStart) {
  const issueFn = `async function issueLicense(){try{$('issueMsg').textContent='Creating…';const orderRef=$('orderRef').value.trim();if(!orderRef)throw Error('Order reference is required');const components={orbitfs_base:true,orbitfs_mcp:false,orbitfs_apex:false,orbitfs_studio:false};document.querySelectorAll('input[name="addon"]:checked').forEach(x=>{components[x.value]=true});const adminOverride=orderRef.toUpperCase()==='ADMIN';const input={orderRef,customerRef:$('customerRef').value.trim(),productCode:'orbitfs_base',components,maxInstallations:Number($('maxInstalls').value||1)};if($('expiry').value)input.expiresAt=new Date($('expiry').value).toISOString();const metadata={...(adminOverride?{adminOverride:true,issuedBy:'admin'}:{}),...($('notes').value.trim()?{notes:$('notes').value.trim()}: {})};if(Object.keys(metadata).length)input.metadata=metadata;const d=await api('/api/admin/licenses/issue',{method:'POST',body:JSON.stringify(input)});$('issueResult').innerHTML='<div class="key">'+esc(d.licenceKey||d.licenseKey||'License issued; key not returned')+'</div>';$('issueMsg').textContent=adminOverride?'ADMIN override: license created with selected components.':'License created by License Master.';await loadAll()}catch(e){$('issueMsg').textContent=e.message}}\n`;
  html = html.slice(0, issueStart) + issueFn + html.slice(issueEnd);
}

const styleMarker = '</style>';
const productCss = `.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.product-card{display:flex;align-items:center;gap:9px;padding:11px;border:1px solid #30415c;background:#0a1423;border-radius:8px;cursor:pointer}.product-card input{width:auto}.product-card span{display:flex;flex-direction:column;gap:2px;flex:1}.product-card small{color:#8290a7;font-size:11px}.product-card em{font-style:normal;color:#8d98aa;font-size:10px}.product-card.required{border-color:#4d4be9}@media(max-width:760px){.product-grid{grid-template-columns:1fr}}`;
if (!html.includes('.product-grid{')) html = html.replace(styleMarker, productCss + styleMarker);

writeFileSync(path, html);

// Patch the known PostgreSQL parameter-type mismatch in both issuance implementations.
for (const file of ['../src/server.ts', '../src/new-api-authority.ts']) {
  const target = new URL(file, import.meta.url);
  let source = readFileSync(target, 'utf8');
  const oldSql = `values($1,$2,$3,'fulfilled',$4,$4,now(),$5) on conflict(order_ref) do nothing`;
  const newSql = `values($1,$2,$3,'fulfilled',$4,$5,now(),$6) on conflict(order_ref) do nothing`;
  if (source.includes(oldSql)) {
    source = source.replace(oldSql, newSql);
    const oldArgs = ` [orderRef, String(input.customerRef || ""), String(input.productCode || "orbitfs_base"), binding.id, { components }]`;
    const newArgs = ` [orderRef, String(input.customerRef || ""), String(input.productCode || "orbitfs_base"), binding.id, String(binding.id), { components }]`;
    if (source.includes(oldArgs)) source = source.replace(oldArgs, newArgs);
    writeFileSync(target, source);
  }
}

console.log('Admin UI, licensing issuance, and PostgreSQL parameter handling normalized.');
