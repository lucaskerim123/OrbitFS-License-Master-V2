import {engineReleaseMetadata} from "@/lib/engine-release";
import {getPanelRelease,listPanelReleases} from "@/lib/panel-release";
import {httpError,requireOrbitAdmin} from "@/lib/orbitfs-deployment";
import {getOrbitfsReleaseBundle,listOrbitfsReleaseBundles,publishOrbitfsReleaseBundleArtifacts,setOrbitfsReleaseBundleStatus,syncOrbitfsReleaseBundle} from "@/lib/orbitfs-release-bundle";
import {userRpc} from "@/lib/paymentServer";

export async function GET(req:Request){
  try{
    await requireOrbitAdmin(req);
    return Response.json({bundles:await listOrbitfsReleaseBundles(150)},{headers:{"cache-control":"no-store"}});
  }catch(e){return httpError(e)}
}

export async function POST(req:Request){
  try{
    const {token}=await requireOrbitAdmin(req);
    const canManage=(await userRpc(token,"has_permission",{p_permission:"licenses.manage"}))===true||(await userRpc(token,"has_permission",{p_permission:"licenses.edit"}))===true;
    if(!canManage)throw Object.assign(new Error("Permission denied"),{status:403});
    const body=await req.json().catch(()=>({})),action=String(body.action||"").trim().toLowerCase(),version=String(body.version||"").trim();
    if(!version)throw Object.assign(new Error("Release version is required"),{status:400});

    if(action==="sync"){
      const panels=await listPanelReleases();
      let panel=panels.find(r=>r.version===version)||null;
      if(!panel){try{panel=(await getPanelRelease(version)).metadata}catch{}}
      const engine=await engineReleaseMetadata(version).catch(()=>null);
      const bundle=await syncOrbitfsReleaseBundle({
        panel,engine,
        components:panel?.components?.length?panel.components:(engine?.components||body.components||[]),
        engineDeployerProtocol:Number(body.engineDeployerProtocol||1),
        minimumEngineDeployerProtocol:Number(body.minimumEngineDeployerProtocol||engine?.minimumEngineDeployerProtocol||1),
        technicalAnalysis:body.technicalAnalysis&&typeof body.technicalAnalysis==="object"?body.technicalAnalysis:undefined
      });
      return Response.json({ok:true,bundle});
    }
    if(action==="publish")return Response.json({ok:true,...await publishOrbitfsReleaseBundleArtifacts(version)});
    if(action==="pause"||action==="withdraw"||action==="fail")return Response.json({ok:true,bundle:await setOrbitfsReleaseBundleStatus(version,action==="pause"?"paused":action==="withdraw"?"withdrawn":"failed")});
    if(action==="get")return Response.json({ok:true,bundle:await getOrbitfsReleaseBundle(version)});
    throw Object.assign(new Error("Unsupported release bundle action"),{status:400});
  }catch(e){return httpError(e)}
}
