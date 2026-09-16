import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(path, 'utf8');

// The existing admin product endpoints are Supabase-admin protected POST routes.
// Keep their method contract intact; this patch only makes the issue form product-driven.
if (!html.includes('id="issueProduct"')) {
  const anchor = '<div class="field"><label>Order reference</label>';
  const replacement = '<div class="field"><label>Product</label><select id="issueProduct"><option value="orbitfs_base">OrbitFS Base</option></select></div>' + anchor;
  html = html.replace(anchor, replacement);
}
html = html.replace("productCode:'orbitfs_base',components:", "productCode:$('issueProduct').value,components:");

if (!html.includes('async function loadIssueProducts(){')) {
  const at = html.indexOf('</script>');
  if (at < 0) throw new Error('Admin script marker not found');
  const js = `\nasync function loadIssueProducts(){try{const d=await api('/api/v1/products');const s=$('issueProduct');if(!s)return;const rows=(d.products||[]).filter(p=>p.active!==false&&p.purchasable!==false);s.innerHTML=rows.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.name||p.code)+'</option>').join('')}catch(e){}}\n`;
  html = html.slice(0, at) + js + html.slice(at);
}
html = html.replace("renderProducts(p.products);loadReleases()", "renderProducts(p.products);loadIssueProducts();loadReleases()");

writeFileSync(path, html);
console.log('Product admin UI finalized');
