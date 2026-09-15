import {licenseDb} from "@/lib/license-api";
import {engineReleaseMetadata,listEngineReleases,publishEngineReleaseDraft,setEngineReleaseStatus} from "@/lib/engine-release";
import {getPanelRelease,latestPanelMetadata,listPanelReleases,savePanelReleaseDraft,setPanelReleaseStatus,submitPanelReleaseDraft,type PanelReleaseChannel,type PanelReleaseDraftPatch,type StoredPanelRelease} from "@/lib/panel-release";
import {deployPanel,httpError,loadInstallation,requireOrbitAdmin,schemaAssetStatus,syncDeployment,uploadSchemaAsset,type DeployAction} from "@/lib/orbitfs-deployment";
import {deregisterOrbitfsInstallation,reconcileOrbitfsInstallation,undeployOrbitfsPanel} from "@/lib/orbitfs-lifecycle";
import {getOrbitfsReleaseBundle,listOrbitfsReleaseBundles,publishOrbitfsReleaseBundleArtifacts,setOrbitfsReleaseBundleStatus,syncOrbitfsReleaseBundle} from "@/lib/orbitfs-release-bundle";
import {userRpc} from "@/lib/paymentServer";

const engineComponent=(value:any)=>["addons","engine","apex","mcp","studio","orbitfs_apex","orbitfs_mcp","orbitfs_studio"].includes(String(value||"").trim().toLowerCase());
type ReleaseView=StoredPanelRelease&{legacy?:boolean};

async function ensureEditableRelease(version:string,patch:PanelReleaseDraftPatch={}):Promise<StoredPanelRelease>{
  const existing=(await listPanelReleases()).find(r=>r.version===version);
  if(existing)return existing;
  const pkg=await getPanelRelease(version);
  return submitPanelReleaseDraft(pkg.bytes,{version,sourceCommit:pkg.metadata.sourceCommit,channel:String(patch.channel||pkg.metadata.channel||"base"),components:patch.components||pkg.metadata.components||["core"],minimumVersion:patch.minimumVersion??pkg.metadata.minimumVersion,rollbackVersion:patch.rollbackVersion??pkg.metadata.rollbackVersion});
}

async function publishManagedRelease(version:string,patch:PanelReleaseDraftPatch={}){
  await ensureEditableRelease(version,patch);
  const candidate=await savePanelReleaseDraft(version,patch),needsEngine=candidate.channel==="update"&&(candidate.components||[]).some(engineComponent);
  let engine=await engineReleaseMetadata(version).catch(()=>null);
  if(needsEngine){
    if(!engine)throw Object.assign(new Error(`Update ${version} includes Engine/add-on components but no matching Engine candidate exists. Build the V1-vercel-engine UPDATE_RELEASE candidate with the same OrbitFS version first.`),{status:409});
    if(engine.status==="withdrawn")throw Object.assign(new Error(`Matching Engine release ${version} is withdrawn`),{status:409});
  }else engine=null;
  const existingBundle=await getOrbitfsReleaseBundle(version).catch(()=>null);
  await syncOrbitfsReleaseBundle({panel:candidate,engine,components:candidate.components,engineDeployerProtocol:existingBundle?.engineDeployerProtocol||1,minimumEngineDeployerProtocol:engine?.minimumEngineDeployerProtocol||existingBundle?.minimumEngineDeployerProtocol||1,technicalAnalysis:existingBundle?.technicalAnalysis||{}});
  const published=await publishOrbitfsReleaseBundleArtifacts(version);
  return {release:published.panel,engineRelease:published.engine,bundle:published.bundle};
}

async function restoreFallback(channel:PanelReleaseChannel,excludedVersion:string){
  const all=await listPanelReleases(),blocked=new Set(all.filter(r=>["paused","withdrawn","failed"].includes(r.status)).map(r=>r.version));
  let candidates=all.filter(r=>r.channel===channel&&r.version!==excludedVersion&&["published","superseded"].includes(r.status));
  candidates=candidates.sort((a,b)=>String(b.publishedAt||b.createdAt).localeCompare(String(a.publishedAt||a.createdAt)));
  if(candidates[0])return publishManagedRelease(candidates[0].version,{});
  if(channel!=="base")return null;
  const {data}=await licenseDb().from("orbitfs_installation_releases").select("release_version,created_at").neq("release_version",excludedVersion).order("created_at",{ascending:false}).limit(30);
  const attempted=new Set<string>();
  for(const row of data||[]){
    const version=String(row.release_version||"").trim();if(!version||blocked.has(version)||attempted.has(version))continue;attempted.add(version);
    try{await ensureEditableRelease(version,{channel:"base",components:["core"]});return publishManagedRelease(version,{})}catch{}
  }
  return null;
}

export async function GET(req:Request){
  try{
    const {token}=await requireOrbitAdmin(req),db=licenseDb();
    const [snapshot,releases,engineReleases,bundles,schema,installs,events,latestBase,latestUpdate,history]=await Promise.all([
      userRpc(token,"admin_orbitfs_release_system_snapshot",{}),listPanelReleases().catch(()=>[]),listEngineReleases().catch(()=>[]),listOrbitfsReleaseBundles(150).catch(()=>[]),schemaAssetStatus().catch(()=>({configured:false,size:0})),db.from("orbitfs_installations").select("*").order("updated_at",{ascending:false}).limit(100),db.from("orbitfs_deployment_events").select("*").order("created_at",{ascending:false}).limit(100),latestPanelMetadata("base").catch(()=>null),latestPanelMetadata("update").catch(()=>null),db.from("orbitfs_installation_releases").select("release_version,release_id,release_sha256,source_commit,created_at").order("created_at",{ascending:false}).limit(250)
    ]);
    const userIds=[...new Set((installs.data||[]).map((x:any)=>x.auth_user_id))];let users:any[]=[];
    if(userIds.length){const u=await db.from("user_profiles").select("id,display_name,company_name,customer_number").in("id",userIds);users=u.data||[]}
    const releaseRows:ReleaseView[]=[...(releases as StoredPanelRelease[])],seen=new Set(releaseRows.map(r=>r.version));
    for(const row of history.data||[]){
      const version=String(row.release_version||"").trim();if(!version||seen.has(version))continue;seen.add(version);const when=String(row.created_at||new Date().toISOString());
      releaseRows.push({version,releaseId:String(row.release_id||`panel-${version}`),sourceCommit:row.source_commit||null,schemaVersion:"1",sha256:String(row.release_sha256||""),size:0,fileCount:0,objectPath:`panel/${version}/release.json.gz`,projectSettings:{},channel:"base",status:"superseded",title:`OrbitFS ${version}`,description:"Legacy release package. Save changes to import it into the current Release Manager.",changelog:"",customerNotes:"",internalNotes:"",severity:"normal",required:false,minimumVersion:null,rollbackVersion:null,rollout:"public",components:["core"],createdAt:when,candidateAt:when,publishedAt:when,updatedAt:when,legacy:true});
    }
    releaseRows.sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
    return Response.json({snapshot,releases:releaseRows,engineReleases,bundles,schema,installations:installs.data||[],events:events.data||[],users,latest:latestBase,latestBase,latestUpdate},{headers:{"cache-control":"no-store"}});
  }catch(e){return httpError(e)}
}

export async function POST(req:Request){
  try{
    const {token,user}=await requireOrbitAdmin(req),canManage=(await userRpc(token,"has_permission",{p_permission:"licenses.manage"}))===true||(await userRpc(token,"has_permission",{p_permission:"licenses.edit"}))===true;
    if(!canManage)throw Object.assign(new Error("Permission denied"),{status:403});
    const body=await req.json().catch(()=>({})),action=String(body.action||"");
    if(action==="upload_schema"){const schema=await uploadSchemaAsset(String(body.sql||""));return Response.json({ok:true,schema})}
    if(action==="save_release"){const version=String(body.version||"");await ensureEditableRelease(version,body.release||{});const release=await savePanelReleaseDraft(version,body.release||{});const engine=await engineReleaseMetadata(version).catch(()=>null);const bundle=await syncOrbitfsReleaseBundle({panel:release,engine:release.channel==="update"&&(release.components||[]).some(engineComponent)?engine:null,components:release.components,minimumEngineDeployerProtocol:engine?.minimumEngineDeployerProtocol||1});return Response.json({ok:true,release,bundle})}
    if(action==="publish_release"||action==="unhide_release"){const result=await publishManagedRelease(String(body.version||""),body.release||{});return Response.json({ok:true,...result})}
    if(action==="hide_release"||action==="pause_release"||action==="withdraw_release"){
      const version=String(body.version||""),candidate=await ensureEditableRelease(version,body.release||{}),wasLatest=(await latestPanelMetadata(candidate.channel).catch(()=>null))?.version===version,status=action==="withdraw_release"?"withdrawn":"paused",release=await setPanelReleaseStatus(version,status);
      if(release.channel==="update"&&(release.components||[]).some(engineComponent)){const engine=await engineReleaseMetadata(version);if(engine)await setEngineReleaseStatus(version,status)}
      const bundle=await getOrbitfsReleaseBundle(version).catch(()=>null);if(bundle)await setOrbitfsReleaseBundleStatus(version,status);
      const fallback=wasLatest?await restoreFallback(release.channel,version):null;return Response.json({ok:true,release,bundle:bundle?await getOrbitfsReleaseBundle(version):null,fallback:fallback?.release||null});
    }
    if(action==="publish_engine_release")return Response.json({ok:true,release:await publishEngineReleaseDraft(String(body.version||""))});
    if(action==="pause_engine_release"||action==="withdraw_engine_release")return Response.json({ok:true,release:await setEngineReleaseStatus(String(body.version||""),action==="pause_engine_release"?"paused":"withdrawn")});
    if(["status","deploy","update","rollback","redeploy","undeploy","deregister"].includes(action)){
      let install=await loadInstallation(String(body.installationId||""),user.id,true);install=await reconcileOrbitfsInstallation(install);
      if(action==="status")return Response.json({installation:install.vercel_project_id&&install.vercel_deployment_id?await syncDeployment(install):install});
      if(action==="undeploy")return Response.json({installation:await undeployOrbitfsPanel(install)});
      if(action==="deregister")return Response.json({result:await deregisterOrbitfsInstallation(install,body.removePanel!==false)});
      let version=body.version?String(body.version):undefined;if(action==="update"&&!version)version=(await latestPanelMetadata("update")).version;
      if(action==="redeploy"&&!install.release_version)throw Object.assign(new Error("The Panel is not currently deployed"),{status:409});
      return Response.json({installation:await deployPanel(install,action as DeployAction,version)});
    }
    throw Object.assign(new Error("Unsupported Release Panel action"),{status:400});
  }catch(e){return httpError(e)}
}
