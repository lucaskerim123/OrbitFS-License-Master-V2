import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

export default function adminControlUi(_req: IncomingMessage, res: ServerResponse) {
  try {
    let html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");
    html = html.replace('<input id="grace" type="number">','<input id="grace" type="number"><div class="actions"><button class="btn primary" id="saveApiSettings" type="button">Save API Settings</button></div><p id="apiSettingsStatus" class="small"></p>');
    html = html.replace("</body>", `<script>
(function(){
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if(new URL(url,location.origin).pathname==='/api/admin/licenses')return nativeFetch('/api/admin-extended?action=licenses',init);
    }catch(_e){}
    return nativeFetch(input,init);
  };
  const save=document.getElementById('saveApiSettings');
  if(!save)return;
  save.addEventListener('click',async function(){
    const token=sessionStorage.getItem('orbitfs_admin_access_token')||'';
    const status=document.getElementById('apiSettingsStatus');
    try{
      if(!token)throw new Error('Administrator session has expired. Please sign in again.');
      save.disabled=true;
      if(status)status.textContent='Saving API settings…';
      const body={issuer:(document.getElementById('issuer')||{}).value.trim(),audience:(document.getElementById('audience')||{}).value.trim(),entitlement_ttl_seconds:Number((document.getElementById('ttl')||{}).value),grace_seconds:Number((document.getElementById('grace')||{}).value)};
      const r=await fetch('/api/admin-extended?action=settings',{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Unable to save API settings');
      const s=d.settings||{};
      if(document.getElementById('ttl'))document.getElementById('ttl').value=s.entitlement_ttl_seconds||'';
      if(document.getElementById('grace'))document.getElementById('grace').value=s.grace_seconds||'';
      if(status)status.textContent='Saved to License Master database. Revision '+String(s.revision||'—')+'.';
      if(typeof window.loadSettings==='function')await window.loadSettings();
    }catch(e){if(status)status.textContent=e.message||String(e);}finally{save.disabled=false;}
  });
})();
</script></body>`);
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store, max-age=0");
    res.end(html);
  } catch (error) {
    console.error("Failed to load License Master admin control UI", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Admin UI unavailable" }));
  }
}
