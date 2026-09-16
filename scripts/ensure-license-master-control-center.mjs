import { readFileSync, writeFileSync } from 'node:fs';

const authorityPath = 'src/new-api-authority.ts';
let authority = readFileSync(authorityPath, 'utf8');
if (!authority.includes('const customerExternalId = String(input.customerExternalId')) {
  const marker = '  const orderRef = String(input.orderRef || req.headers.get("x-orbitfs-order-ref") || "").trim();\n';
  if (!authority.includes(marker)) throw new Error('issueLicense orderRef marker not found');
  authority = authority.replace(marker, marker + '  const customerExternalId = String(input.customerExternalId || input.customerRef || "").trim();\n  if (!customerExternalId || customerExternalId.length > 200) throw new AuthorityError(400, "customerExternalId is required", "CUSTOMER_EXTERNAL_ID_REQUIRED");\n');
  authority = authority.replaceAll('String(input.customerRef || "")', 'customerExternalId');
  writeFileSync(authorityPath, authority);
}

const adminPath = 'src/admin-console.ts';
let admin = readFileSync(adminPath, 'utf8');
if (!admin.includes('const customerExternalId = String(input.customerExternalId || input.customerRef ||')) {
  const marker = "  const orderRef = String(input.orderRef || '').trim();\n  if (!orderRef || orderRef.length > 200) return json({ error: 'Order reference is required' }, 400);";
  const replacement = "  const customerExternalId = String(input.customerExternalId || input.customerRef || '').trim();\n  const adminOverride = customerExternalId.toUpperCase() === 'ADMIN';\n  const orderRef = String(input.orderRef || '').trim();\n  if (!customerExternalId) return json({ error: 'Customer external ID is required' }, 400);\n  if (!adminOverride && (!orderRef || orderRef.length > 200)) return json({ error: 'Order reference is required for billing customers' }, 400);\n  const effectiveOrderRef = adminOverride ? `ADMIN-${randomUUID()}` : orderRef;";
  if (!admin.includes(marker)) throw new Error('admin issue order/customer marker not found');
  admin = admin.replace(marker, replacement);
  admin = admin.replaceAll('[orderRef]', '[effectiveOrderRef]');
  admin = admin.replace("String(input.customerRef || '')", 'customerExternalId');
  admin = admin.replace("[randomUUID(), binding.id, { orderRef }]", "[randomUUID(), binding.id, { orderRef: effectiveOrderRef, customerExternalId, adminOverride }]");
  writeFileSync(adminPath, admin);
}

const htmlPath = 'web/admin.html';
let html = readFileSync(htmlPath, 'utf8');
const marker = '/* ORBITFS_LICENSE_MASTER_CONTROL_CENTER_V1 */';
if (!html.includes(marker)) {
  const script = `<script>${marker}\n(function(){\nconst esc2=v=>String(v??'').replace(/[&<>\\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}[c]));\nfunction installMasterUI(){\n  document.querySelectorAll('label').forEach(l=>{if(/Customer external id/i.test(l.textContent||'')) l.innerHTML=l.innerHTML.replace(/Customer external id/ig,'Customer external ID (Billing Store customer number)');});\n  const releasesBody=document.getElementById('releasesBody');\n  if(releasesBody){const host=releasesBody.parentElement; if(host&&!document.getElementById('releaseSystemTabs')){const bar=document.createElement('div');bar.id='releaseSystemTabs';bar.style='display:flex;gap:8px;margin:12px 0';bar.innerHTML='<button class=btn id=baseReleaseTab>Base Deployments</button><button class=btn id=updateReleaseTab>Update Release System</button><span id=releaseModeNote style=margin-left:8px;opacity:.7></span>';host.insertBefore(bar,releasesBody);let mode='base';const render=async()=>{const d=await admin('/releases');const rows=(d.releases||[]).filter(x=>mode==='base'?String(x.channel)==='base'||String(x.component)==='orbitfs_base':String(x.channel)!=='base'&&String(x.component)!=='orbitfs_base');releasesBody.innerHTML=rows.map(x=>'<tr><td>'+esc2(x.component)+'</td><td>'+esc2(x.version)+'</td><td>'+esc2(x.channel)+'</td><td>'+esc2(x.title)+'</td><td>'+esc2(x.status)+'</td><td>'+esc2(x.source_commit||'—')+'</td></tr>').join('')||'<tr><td colspan=6>No releases in this section.</td></tr>';document.getElementById('releaseModeNote').textContent=mode==='base'?'Base deployment releases and controls':'Future update automation, auto-drafters and deployment tooling';};document.getElementById('baseReleaseTab').onclick=()=>{mode='base';render()};document.getElementById('updateReleaseTab').onclick=()=>{mode='update';render()};render();}}\n  const installationsBody=document.getElementById('installationsBody');\n  if(installationsBody){const host=installationsBody.parentElement;if(host&&!document.getElementById('installationLogNote')){const n=document.createElement('div');n.id='installationLogNote';n.style='margin:12px 0;opacity:.75';n.textContent='Installation and deployment log: customer, license, component, device, host, version, first seen, last seen and deployment history.';host.insertBefore(n,installationsBody);}}\n}\nconst oldShow=window.show;window.show=function(v){if(oldShow)oldShow(v);setTimeout(installMasterUI,0)};setTimeout(installMasterUI,0);\n})();</script>`;
  html = html.replace('</body>', script + '</body>');
  writeFileSync(htmlPath, html);
}
console.log('OrbitFS License Master control center normalized');
