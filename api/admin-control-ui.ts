import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";

export default function adminControlUi(_req: IncomingMessage, res: ServerResponse) {
  let html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");
  html = html.replace("</body>", `<script>
(function(){
  const rewrite=(v)=>typeof v==='string'?v.replaceAll('/api/v1/','/api/'):v;
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    if(typeof input==='string') input=rewrite(input);
    else if(input&&input.url) input=new Request(rewrite(input.url),input);
    return nativeFetch(input,init);
  };
  const canonicalRows=[
    ['GET','/api/health','Service health'],
    ['GET','/api/products','Product catalogue'],
    ['GET','/api/licenses','License administration'],
    ['POST','/api/license/issue','License issuance'],
    ['POST','/api/license/validate','Runtime validation'],
    ['GET','/api/license/revision','License API revision'],
    ['GET','/api/license/public-key','Entitlement public key'],
    ['GET','/api/releases','Release catalogue'],
    ['GET','/api/releases/latest','Latest release'],
    ['POST','/api/releases/:id/validate','Release validation'],
    ['POST','/api/releases/:id/publish','Release publish'],
    ['POST','/api/releases/:id/control','Release control'],
    ['GET','/api/installations','Installations'],
    ['GET','/api/deployments','Deployment jobs'],
    ['POST','/api/deployments/execute','Execute deployment'],
    ['POST','/api/deployments/sync','Sync deployment state'],
    ['GET','/api/billing','Billing service handshake'],
    ['POST','/api/admin/licenses/:id/control','License enforcement control']
  ];
  const renderCanonicalEndpoints=()=>{const box=document.getElementById('endpointList');if(!box)return;box.innerHTML=canonicalRows.map(x=>'<div class="endpoint"><span class="method">'+x[0]+'</span><span>'+x[1]+'</span><span class="muted">'+x[2]+'</span></div>').join('');};
  const nativeCopy=window.copyText;
  if(typeof nativeCopy==='function') window.copyText=(value)=>nativeCopy(rewrite(value));
  const normalize=()=>{
    document.querySelectorAll('*').forEach((el)=>{
      if(el.childElementCount===0 && typeof el.textContent==='string' && el.textContent.includes('/api/v1/')) el.textContent=rewrite(el.textContent);
      if('value' in el && typeof el.value==='string' && el.value.includes('/api/v1/')) el.value=rewrite(el.value);
    });
    renderCanonicalEndpoints();
  };
  normalize();
  new MutationObserver(normalize).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['value']});
})();
</script>
<script>
(function(){
  const originalLoadSettings = window.loadSettings;
  window.loadSettings = async function(){
    const state=document.getElementById('settingsState');
    if(state) state.textContent='Loading settings from License Master database…';
    try{
      const accessToken=sessionStorage.getItem('orbitfs_admin_access_token')||'';
      if(!accessToken) throw new Error('Administrator session has expired. Please sign in again.');
      const r=await fetch('/api/admin-settings',{headers:{authorization:'Bearer '+accessToken}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||'Unable to load settings');
      const s=d.settings||{};
      const box=document.getElementById('settingsBox');
      if(box) box.innerHTML='<b>Database</b><span class="badge">CONNECTED</span><b>Issuer</b><span>'+String(s.issuer||'—')+'</span><b>Audience</b><span>'+String(s.audience||'—')+'</span><b>Entitlement TTL</b><span>'+String(s.entitlement_ttl_seconds??'—')+' seconds</span><b>Grace period</b><span>'+String(s.grace_seconds??'—')+' seconds</span><b>API mode</b><span>'+String(s.api_mode||'online')+'</span><b>Offline grace</b><span>'+String(s.allow_offline_grace?'Enabled':'Disabled')+'</span>';
      const issuer=document.getElementById('issuer'); if(issuer) issuer.value=s.issuer||'';
      const audience=document.getElementById('audience'); if(audience) audience.value=s.audience||'';
      const ttl=document.getElementById('ttl'); if(ttl) ttl.value=s.entitlement_ttl_seconds||10800;
      const grace=document.getElementById('grace'); if(grace) grace.value=s.grace_seconds??604800;
      let controls=document.getElementById('lmAuthorityControls');
      if(!controls){ controls=document.createElement('div'); controls.id='lmAuthorityControls'; controls.className='card'; controls.style.marginTop='12px'; controls.innerHTML='<div class="head"><div><h2>API Authority Controls</h2><p class="sub">These controls are stored in master_license_settings and are authoritative for runtime enforcement.</p></div><span id="lmDbBadge" class="badge">DATABASE CONNECTED</span></div><div class="actions"><button class="btn primary" id="lmOnline">API Online</button><button class="btn warn" id="lmMaintenance">Maintenance</button><button class="btn danger" id="lmOffline">API Offline</button><label style="display:flex;align-items:center;gap:7px;font-size:10px"><input id="lmOfflineGrace" type="checkbox"> Allow offline grace</label><button class="btn" id="lmSaveAuthority">Save Authority</button></div><p id="lmAuthorityMsg" class="small"></p>'; const section=document.getElementById('api-settings'); if(section) section.appendChild(controls); }
      const graceToggle=document.getElementById('lmOfflineGrace'); if(graceToggle) graceToggle.checked=s.allow_offline_grace!==false;
      const mode=s.api_mode||'online';
      const msg=document.getElementById('lmAuthorityMsg'); if(msg) msg.textContent='Database connected. Current mode: '+mode;
      let selected=mode;
      ['lmOnline','lmMaintenance','lmOffline'].forEach(id=>{const b=document.getElementById(id); if(b)b.onclick=()=>{selected=id==='lmOnline'?'online':id==='lmMaintenance'?'maintenance':'offline'; if(msg)msg.textContent='Selected mode: '+selected+' — press Save Authority';};});
      const save=document.getElementById('lmSaveAuthority'); if(save) save.onclick=async()=>{try{const body={issuer:(document.getElementById('issuer')||{}).value||s.issuer,audience:(document.getElementById('audience')||{}).value||s.audience,entitlement_ttl_seconds:Number((document.getElementById('ttl')||{}).value||10800),grace_seconds:Number((document.getElementById('grace')||{}).value||604800),api_mode:selected,allow_offline_grace:!!(document.getElementById('lmOfflineGrace')||{}).checked,revision:Number(s.revision||1)+1};const currentToken=sessionStorage.getItem('orbitfs_admin_access_token')||'';const rr=await fetch('/api/admin-settings',{method:'PATCH',headers:{authorization:'Bearer '+currentToken,'content-type':'application/json'},body:JSON.stringify(body)});const dd=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(dd.error||'Unable to save settings');if(msg)msg.textContent='Saved to License Master database. Mode: '+selected;await window.loadSettings();}catch(e){if(msg)msg.textContent=e.message;}};
    }catch(e){ if(state) state.textContent='Unable to load settings: '+e.message; }
  };
  setTimeout(()=>{if(document.getElementById('api-settings'))window.loadSettings();},0);
})();
</script></body>`);
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end(html);
}