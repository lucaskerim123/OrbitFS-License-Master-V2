import {httpError,requireOrbitUser} from "@/lib/orbitfs-deployment";

export const dynamic="force-dynamic";

const hasBase=(b:any)=>b?.license_product_key==="orbitfs_base"||!!b?.components?.orbitfs_base||!!b?.components?.orbitfs_panel;

async function resolveUser(req:Request){
  const auth=String(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const billingToken=String(process.env.BILLING_API_TOKEN||"").trim();
  const serviceUserId=String(req.headers.get("x-orbit-user-id")||"").trim();
  if(serviceUserId){
    if(!auth||!billingToken||auth!==billingToken)throw Object.assign(new Error("Billing service authentication failed"),{status:401});
    return {id:serviceUserId};
  }
  return (await requireOrbitUser(req)).user;
}

async function restRows(table:string,params:Record<string,string>={},fallback:any[]=[]){
  const base=String(process.env.SUPABASE_URL||"").replace(/\/+$/,"");
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  if(!base||!key)throw Object.assign(new Error("License Master Supabase service configuration is missing"),{status:503});
  const url=new URL(`${base}/rest/v1/${table}`);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4000);
  try{
    const r=await fetch(url,{headers:{apikey:key,authorization:`Bearer ${key}`,accept:"application/json"},cache:"no-store",signal:controller.signal});
    if(!r.ok)throw Object.assign(new Error(`License Master database request failed (${r.status})`),{status:503});
    const data=await r.json().catch(()=>fallback);
    return Array.isArray(data)?data:fallback;
  }catch(e:any){
    if(e?.name==="AbortError")throw Object.assign(new Error("License Master database request timed out"),{status:504});
    throw e;
  }finally{clearTimeout(timer)}
}

export async function GET(req:Request){
  try{
    const user=await resolveUser(req);
    const userFilter={auth_user_id:`eq.${user.id}`};
    const [bindings,connections,installations]=await Promise.all([
      restRows("license_bindings",{...userFilter,archived_at:"is.null",order:"created_at.desc"}),
      restRows("orbitfs_provider_connections",{...userFilter,order:"created_at.desc"}),
      restRows("orbitfs_installations",{...userFilter,order:"created_at.desc"})
    ]);

    const bindingRows=bindings.sort((a:any,b:any)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
    const installationRows=installations;
    const preferredBinding=bindingRows.find(hasBase)||bindingRows[0]||null;
    const preferredInstall=preferredBinding?installationRows.find((x:any)=>x.license_binding_id===preferredBinding.id):null;

    let connectionRows=connections.map((x:any)=>({...x,metadata:{...(x.metadata||{})}}));
    if(preferredInstall?.vercel_project_id){
      connectionRows=connectionRows.map((x:any)=>x.provider==="vercel"?{...x,team_id:preferredInstall.vercel_team_id||x.team_id,metadata:{...(x.metadata||{}),team_id:preferredInstall.vercel_team_id||x.metadata?.team_id||null,team_locked:true}}:x);
    }

    let events:any[]=[],releases:any[]=[];
    const ids=installationRows.map((x:any)=>x.id).filter(Boolean);
    if(ids.length){
      const inFilter=`in.(${ids.map((id:any)=>`"${String(id).replace(/"/g,'\\"')}"`).join(",")})`;
      const [eventRows,releaseRows]=await Promise.all([
        restRows("orbitfs_deployment_events",{installation_id:inFilter,order:"created_at.desc",limit:"40"}),
        restRows("orbitfs_installation_releases",{installation_id:inFilter,order:"created_at.desc",limit:"40"})
      ]);
      events=eventRows;releases=releaseRows;
    }

    return Response.json({settings:{enabled:true,customer_deploy_enabled:true,supabase_oauth_enabled:true,vercel_oauth_enabled:true},bindings:bindingRows,connections:connectionRows,installations:installationRows,events,releases,latestRelease:null,latestBase:null,latestUpdate:null},{headers:{"cache-control":"no-store"}});
  }catch(e){return httpError(e)}
}
