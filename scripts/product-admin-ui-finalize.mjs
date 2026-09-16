import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(path, 'utf8');

// Product editor API must use the canonical PATCH/DELETE contract.
html = html.replace(/api\('\/api\/admin\/products\/\'+encodeURIComponent\(id\),\{method:'POST',body:JSON\.stringify\(\{code:/g, "api('/api/admin/products/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({code:");
html = html.replace(/api\('\/api\/admin\/products\/\'+encodeURIComponent\(id\),\{method:'POST',body:JSON\.stringify\(\{delete:true\}\)\}/g, "api('/api/v1/products/'+encodeURIComponent(id),{method:'DELETE'}");

// Make the issue form select a canonical product instead of hard-coding Base.
if (!html.includes('id="issueProduct"')) {
  const anchor = '<div class="field"><label>Order reference</label>';
  const replacement = '<div class="field"><label>Product</label><select id="issueProduct"><option value="orbitfs_base">OrbitFS Base</option></select></div>' + anchor;
  html = html.replace(anchor, replacement);
}
html = html.replace("productCode:'orbitfs_base',components:", "productCode:$('issueProduct').value,components:");

const marker = 'async function loadIssueProducts(){';
if (!html.includes(marker)) {
  const at = html.indexOf('</script>');
  if (at < 0) throw new Error('Admin script marker not found');
  const js = `\nasync function loadIssueProducts(){try{const d=await api('/api/v1/products');const s=$('issueProduct');if(!s)return;const rows=(d.products||[]).filter(p=>p.active!==false&&p.purchasable!==false);s.innerHTML=rows.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.name||p.code)+'</option>').join('')}catch(e){}}\n`;
  html = html.slice(0, at) + js + html.slice(at);
}
if (!html.includes('loadIssueProducts();')) html = html.replace('async function loadAll(){', 'async function loadAll(){');
// Run product loading whenever the existing global loader runs.
html = html.replace("renderProducts(p.products);loadReleases()", "renderProducts(p.products);loadIssueProducts();loadReleases()");

writeFileSync(path, html);
console.log('Product admin UI finalized');
