import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Canonical /admin entry. The complete admin UI lives in web/admin.html. */
export default function admin(_req: IncomingMessage, res: ServerResponse) {
  try {
    let html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");
    html = html.replace("</body>", `<script>
/* Release-source correction: Base releases come from V1-vercel-base/release-updates; Engine updates come from V1-vercel-engine/release-updates. */
window.loadReleaseSources=async function(){
  try{
    const get=async kind=>{const r=await fetch('/api/admin-extended?action=releaseSource&kind='+encodeURIComponent(kind),{headers:{authorization:'Bearer '+token,'x-release-kind':kind}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Unable to read release source');return d.source};
    releaseSources.base=await get('base');
    releaseSources.update=await get('update');
    renderReleaseSources();
  }catch(e){
    ['baseSource','updateSource'].forEach(id=>{if($(id))$(id).innerHTML='<b>Release source unavailable</b><span>'+esc(e.message)+'</span>';});
  }
};
setTimeout(()=>{if(window.loadReleaseSources)window.loadReleaseSources()},0);
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
