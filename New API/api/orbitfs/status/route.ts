import {licenseDb} from "@/lib/license-api";
import {httpError,requireOrbitUser} from "@/lib/orbitfs-deployment";

export const dynamic="force-dynamic";

const timeout=async<T>(promise:Promise<T>,fallback:T,ms=5000):Promise<T>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise.catch(()=>fallback),new Promise<T>(resolve=>{timer=setTimeout(()=>resolve(fallback),ms)})])}
  finally{if(timer)clearTimeout(timer)}
};

const hasBase=(b:any)=>b?.license_product_key==="orbitfs_base"||!!b?.components?.orbitfs_base||!!b?.components?.orbitfs_panel;

async function resolveUser(req:Request){
  const auth=String(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  const billingToken=String(process.env.BILLING_API_TOKEN||"").trim();
  const serviceUserId=String(req.headers.get("x-orbit-user-id")||"").trim();
  if(auth&&billingToken&&serviceUserId&&auth===billingToken)return {id:serviceUserId};
  return (await requireOrbitUser(req)).user;
}

export async function GET(req:Request){
  try{
    const user=await resolveUser(req),db=licenseDb();

    const bindingsP=db.from("license_bindings").select("*").eq("auth_user_id",user.id).is("archived_at",null).order("created_at",{ascending:false});
    const connectionsP=db.from("orbitfs_provider_connections").select("id,provider,status,provider_account_id,provider_account_name,team_id,scopes,token_expires_at,connected_at,refreshed_at,last_error,metadata").eq("auth_user_id",user.id);
    const installationsP=db.from("orbitfs_installations").select("*").eq("auth_user_id",user.id).order("created_at",{ascending:false});

    const [bindings,connections,installations]=await Promise.all([
      timeout(bindingsP as any,{data:[],error:null}),
      timeout(connectionsP as any,{data:[],error:null}),
      timeout(installationsP as any,{data:[],error:null})
    ]);

    const bindingRows=(bindings.data||[]).sort((a:any,b:any)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
    const installationRows=installations.data||[];
    const preferredBinding=bindingRows.find(hasBase)||bindingRows[0]||null;
    const preferredInstall=preferredBinding?installationRows.find((x:any)=>x.license_binding_id===preferredBinding.id):null;

    let connectionRows=(connections.data||[]).map((x:any)=>({...x,metadata:{...(x.metadata||{})}}));
    if(preferredInstall?.vercel_project_id){
      connectionRows=connectionRows.map((x:any)=>x.provider==="vercel"?{...x,team_id:preferredInstall.vercel_team_id||x.team_id,metadata:{...(x.metadata||{}),team_id:preferredInstall.vercel_team_id||x.metadata?.team_id||null,team_locked:true}}:x);
    }

    let events:any[]=[],releases:any[]=[];
    const ids=installationRows.map((x:any)=>x.id).filter(Boolean);
    if(ids.length){
      const [eventResult,releaseResult]=await Promise.all([
        timeout(db.from("orbitfs_deployment_events").select("*").in("installation_id",ids).order("created_at",{ascending:false}).limit(40) as any,{data:[],error:null}),
        timeout(db.from("orbitfs_installation_releases").select("*").in("installation_id",ids).order("created_at",{ascending:false}).limit(40) as any,{data:[],error:null})
      ]);
      events=eventResult.data||[];releases=releaseResult.data||[];
    }

    return Response.json({
      settings:{enabled:true,customer_deploy_enabled:true,supabase_oauth_enabled:true,vercel_oauth_enabled:true},
      bindings:bindingRows,
      connections:connectionRows,
      installations:installationRows,
      events,
      releases,
      latestRelease:null,
      latestBase:null,
      latestUpdate:null
    },{headers:{"cache-control":"no-store"}});
  }catch(e){return httpError(e)}
}
