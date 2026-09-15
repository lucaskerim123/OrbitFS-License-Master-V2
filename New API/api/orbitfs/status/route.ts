import {licenseDb} from "@/lib/license-api";
import {latestPanelMetadata} from "@/lib/panel-release";
import {httpError,publicReleaseSettings,requireOrbitUser} from "@/lib/orbitfs-deployment";
import {reconcileOrbitfsInstallation} from "@/lib/orbitfs-lifecycle";

function installationScore(i:any){if(!i)return 0;if(i.release_version||i.state==="ready")return 50;if(i.vercel_project_id)return 40;if(i.database_initialized_at)return 30;if(i.supabase_project_ref)return 20;return 10}
function hasBase(b:any){return b?.license_product_key==="orbitfs_base"||!!b?.components?.orbitfs_base||!!b?.components?.orbitfs_panel}

export async function GET(req:Request){
  try{
    const {user}=await requireOrbitUser(req),db=licenseDb();
    const [settings,bindings,connections,installations,latestBase,latestUpdate]=await Promise.all([
      publicReleaseSettings(),db.from("license_bindings").select("*").eq("auth_user_id",user.id).is("archived_at",null).order("created_at",{ascending:false}),db.from("orbitfs_provider_connections").select("id,provider,status,provider_account_id,provider_account_name,team_id,scopes,token_expires_at,connected_at,refreshed_at,last_error,metadata").eq("auth_user_id",user.id),db.from("orbitfs_installations").select("*").eq("auth_user_id",user.id).order("created_at",{ascending:false}),latestPanelMetadata("base").catch(()=>null),latestPanelMetadata("update").catch(()=>null)
    ]);
    let installationRows=installations.data||[],connectionRows=(connections.data||[]).map((x:any)=>({...x,metadata:{...(x.metadata||{})}}));
    const installByBinding=new Map<string,any>();for(const i of installationRows){const key=String(i.license_binding_id||""),current=installByBinding.get(key);if(!current||installationScore(i)>installationScore(current))installByBinding.set(key,i)}
    const bindingRows=[...(bindings.data||[])].sort((a:any,b:any)=>{const diff=installationScore(installByBinding.get(String(b.id)))-installationScore(installByBinding.get(String(a.id)));return diff||String(b.created_at||"").localeCompare(String(a.created_at||""))});
    const preferredBinding=bindingRows.find(hasBase),preferredIndex=preferredBinding?installationRows.findIndex((x:any)=>x.license_binding_id===preferredBinding.id):-1,vercel=connectionRows.find((x:any)=>x.provider==="vercel"&&x.status==="connected");
    if(preferredIndex>=0&&installationRows[preferredIndex]?.vercel_project_id&&vercel?.metadata?.api_ready===true){const reconciled=await reconcileOrbitfsInstallation(installationRows[preferredIndex]);installationRows=installationRows.map((x:any,index:number)=>index===preferredIndex?reconciled:x)}
    const preferredInstall=preferredBinding?installationRows.find((x:any)=>x.license_binding_id===preferredBinding.id):null;
    if(preferredInstall?.vercel_project_id){connectionRows=connectionRows.map((x:any)=>x.provider==="vercel"?{...x,team_id:preferredInstall.vercel_team_id||x.team_id,metadata:{...(x.metadata||{}),team_id:preferredInstall.vercel_team_id||x.metadata?.team_id||null,teams:[],team_locked:true}}:x)}
    const ids=installationRows.map((x:any)=>x.id);let events:any[]=[];let releases:any[]=[];
    if(ids.length){const [e,r]=await Promise.all([db.from("orbitfs_deployment_events").select("*").in("installation_id",ids).order("created_at",{ascending:false}).limit(40),db.from("orbitfs_installation_releases").select("*").in("installation_id",ids).order("created_at",{ascending:false}).limit(40)]);events=e.data||[];releases=r.data||[]}
    const latest=preferredInstall?.release_version?(latestUpdate||latestBase):latestBase,slim=(x:any)=>x?{version:x.version,releaseId:x.releaseId,publishedAt:x.publishedAt,sourceCommit:x.sourceCommit,title:x.title,description:x.description,changelog:x.changelog,customerNotes:x.customerNotes,severity:x.severity,required:x.required,rollout:x.rollout,channel:x.channel}:null;
    return Response.json({settings,bindings:bindingRows,connections:connectionRows,installations:installationRows,events,releases,latestRelease:slim(latest),latestBase:slim(latestBase),latestUpdate:slim(latestUpdate)},{headers:{"cache-control":"no-store"}});
  }catch(e){return httpError(e)}
}
