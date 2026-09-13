import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Canonical /admin entry. The complete admin UI lives in web/admin.html. */
export default function admin(_req: IncomingMessage, res: ServerResponse) {
  try {
    let html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");
    html = html.replace("</body>", `<script>
/* License Master control-plane corrections. */
window.renderReleaseSources=function(){if($("baseSource"))$("baseSource").innerHTML='<b>Base deployment source</b><span><a href="https://github.com/lucaskerim123/V1-vercel-base/tree/base-release" target="_blank" rel="noreferrer">https://github.com/lucaskerim123/V1-vercel-base/tree/base-release</a></span>';if($("updateSource"))$("updateSource").innerHTML='<b>Update release source</b><span><a href="https://github.com/lucaskerim123/V1-vercel-engine/tree/release-updates" target="_blank" rel="noreferrer">https://github.com/lucaskerim123/V1-vercel-engine/tree/release-updates</a></span>'};
window.sourceBranch=function(mode){return mode==='base'?'base-release':'release-updates'};
window.loadReleaseSources=async function(){releaseSources.base={repo:'lucaskerim123/V1-vercel-base',branch:'base-release',url:'https://github.com/lucaskerim123/V1-vercel-base/tree/base-release'};releaseSources.update={repo:'lucaskerim123/V1-vercel-engine',branch:'release-updates',url:'https://github.com/lucaskerim123/V1-vercel-engine/tree/release-updates'};renderReleaseSources();};

async function lmProductRequest(method,id,body){
  const url='/api/admin-extended?action=products'+(id?'&id='+encodeURIComponent(id):'');
  const r=await fetch(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw Error(d.error||d.message||'Product operation failed');
  return d;
}

function lmProductEditor(product){
  const p=product||{};
  const wrap=document.createElement('div');
  wrap.id='lmProductManager';
  wrap.className='card';
  wrap.style.marginTop='12px';
  wrap.innerHTML='<div class="head"><div><h2>Product Manager</h2><p class="sub">Create and manage the canonical products used by Billing, licensing and entitlements.</p></div><button class="btn" type="button" onclick="lmClearProduct()">New</button></div>'+
    '<div class="grid cols2"><div><div class="field"><label>Product ID</label><input id="lmProdId" value="'+esc(p.id||'')+'" placeholder="prod_orbitfs_base"></div><div class="field"><label>Code</label><input id="lmProdCode" value="'+esc(p.code||'')+'" placeholder="orbitfs_base"></div><div class="field"><label>Name</label><input id="lmProdName" value="'+esc(p.name||'')+'" placeholder="OrbitFS Base"></div><div class="field"><label>Slug</label><input id="lmProdSlug" value="'+esc(p.slug||'')+'" placeholder="orbitfs-base"></div><div class="field"><label>Description</label><textarea id="lmProdDesc">'+esc(p.description||'')+'</textarea></div></div><div><div class="field"><label>Type</label><select id="lmProdType"><option value="component">component</option><option value="addon">addon</option><option value="service">service</option><option value="bundle">bundle</option></select></div><div class="field"><label>Runtime</label><input id="lmProdRuntime" value="'+esc(p.runtime||'engine')+'" placeholder="engine"></div><div class="field"><label>Component key</label><input id="lmProdComponent" value="'+esc(p.component_key||'')+'" placeholder="orbitfs_base"></div><div class="field"><label>Price (AUD)</label><input id="lmProdPrice" type="number" step="0.01" value="'+esc(p.price_amount??0)+'"></div><div class="field"><label>Max installations</label><input id="lmProdMax" type="number" min="1" max="100" value="'+esc(p.max_installations??1)+'"></div><label style="font-size:10px"><input id="lmProdActive" type="checkbox" '+(p.active!==false?'checked':'')+'> Active</label> <label style="font-size:10px"><input id="lmProdPurchasable" type="checkbox" '+(p.purchasable!==false?'checked':'')+'> Purchasable</label><div class="actions" style="margin-top:12px"><button class="btn primary" type="button" onclick="lmSaveProduct()">Save product</button><button class="btn danger" type="button" onclick="lmDeleteProduct()">Delete</button></div></div></div>';
  if(p.product_type) setTimeout(()=>{const e=document.getElementById('lmProdType');if(e)e.value=p.product_type},0);
  return wrap;
}
window.lmClearProduct=function(){const old=document.getElementById('lmProductManager');if(old)old.replaceWith(lmProductEditor(null));};
window.lmEditProduct=function(id){(async()=>{try{const d=await lmProductRequest('GET');const p=(d.products||[]).find(x=>x.id===id);if(!p)throw Error('Product not found');const old=document.getElementById('lmProductManager');if(old)old.replaceWith(lmProductEditor(p));}catch(e){toast(e.message,true)}})()};
window.lmSaveProduct=async function(){try{const id=document.getElementById('lmProdId').value.trim();const input={id:id||undefined,code:document.getElementById('lmProdCode').value.trim(),name:document.getElementById('lmProdName').value.trim(),slug:document.getElementById('lmProdSlug').value.trim(),description:document.getElementById('lmProdDesc').value,product_type:document.getElementById('lmProdType').value,runtime:document.getElementById('lmProdRuntime').value.trim(),component_key:document.getElementById('lmProdComponent').value.trim()||null,price_amount:Number(document.getElementById('lmProdPrice').value||0),max_installations:Number(document.getElementById('lmProdMax').value||1),active:document.getElementById('lmProdActive').checked,purchasable:document.getElementById('lmProdPurchasable').checked};await lmProductRequest(id?'PATCH':'POST',id||'',input);toast('Product saved');await loadAll();}catch(e){toast(e.message,true)}};
window.lmDeleteProduct=async function(){try{const id=document.getElementById('lmProdId').value.trim();if(!id){lmClearProduct();return}if(!confirm('Delete this product from the License Master catalogue?'))return;await lmProductRequest('DELETE',id);toast('Product deleted');lmClearProduct();await loadAll();}catch(e){toast(e.message,true)}};

function lmMountManagers(){
  try{
    const products=document.getElementById('products');
    if(products&&!document.getElementById('lmProductManager'))products.appendChild(lmProductEditor(null));
    const settings=document.getElementById('api-settings');
    if(settings&&!document.getElementById('lmSettingsActions')){
      const card=settings.querySelector('.card');
      if(card){const box=document.createElement('div');box.id='lmSettingsActions';box.className='card';box.style.marginTop='12px';box.innerHTML='<div class="head"><div><h2>Authority Configuration</h2><p class="sub">These values are read by runtime entitlement validation.</p></div><button class="btn primary" type="button" onclick="lmSaveSettings()">Save settings</button></div><div class="grid cols3"><div class="field"><label>API state</label><select id="lmEnabled"><option value="true">Online</option><option value="false">Offline</option></select></div><div class="field"><label>Mode</label><select id="lmMode"><option value="active">Active</option><option value="offline">Offline grace</option><option value="maintenance">Maintenance</option></select></div><div class="field"><label>Allow offline grace</label><select id="lmOfflineGrace"><option value="true">Yes</option><option value="false">No</option></select></div><div class="field"><label>Issuer</label><input id="lmIssuer"></div><div class="field"><label>Audience</label><input id="lmAudience"></div><div class="field"><label>Entitlement TTL (seconds)</label><input id="lmTtl" type="number"></div><div class="field"><label>Grace period (seconds)</label><input id="lmGrace" type="number"></div></div><p id="lmSettingsStatus" class="small"></p>';settings.appendChild(box);}
    }
    lmRefreshSettings();
  }catch(e){console.error(e)}
}
window.lmRefreshSettings=async function(){try{const d=await fetch('/api/admin-settings',{headers:{authorization:'Bearer '+token}});const x=await d.json();if(!d.ok)throw Error(x.error||'Unable to load License Master settings');const s=x.settings||{};['lmIssuer','lmAudience','lmTtl','lmGrace'].forEach((id)=>{const e=document.getElementById(id);if(e)e.value=id==='lmIssuer'?s.issuer||'':id==='lmAudience'?s.audience||'':id==='lmTtl'?(s.entitlement_ttl_seconds||10800):(s.grace_seconds||604800)});const en=document.getElementById('lmEnabled');if(en)en.value=s.enabled===false?'false':'true';const mode=document.getElementById('lmMode');if(mode)mode.value=s.mode||'active';const og=document.getElementById('lmOfflineGrace');if(og)og.value=s.allow_offline_grace===false?'false':'true';const st=document.getElementById('lmSettingsStatus');if(st)st.textContent=(x.database?'Connected to License Master database. ':'Database unavailable. ')+(x.settings_found?'Settings loaded.':'Defaults loaded; settings row was not found.');}catch(e){const st=document.getElementById('lmSettingsStatus');if(st)st.textContent=e.message;}};
window.lmSaveSettings=async function(){try{const body={enabled:document.getElementById('lmEnabled').value==='true',mode:document.getElementById('lmMode').value,allow_offline_grace:document.getElementById('lmOfflineGrace').value==='true',issuer:document.getElementById('lmIssuer').value.trim(),audience:document.getElementById('lmAudience').value.trim(),entitlement_ttl_seconds:Number(document.getElementById('lmTtl').value),grace_seconds:Number(document.getElementById('lmGrace').value)};const r=await fetch('/api/admin-settings',{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to save settings');toast('License Master API settings saved');await lmRefreshSettings();}catch(e){toast(e.message,true)}};

setTimeout(()=>{if(window.loadReleaseSources)window.loadReleaseSources();lmMountManagers()},0);
</script></body>`);
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store, max-age=0");
    res.end(html);
  } catch (error) {
    console.error("Failed to load License Master admin UI", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Admin UI unavailable" }));
  }
}
