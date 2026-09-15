import {cors,reply} from "@/lib/license-api";
import {authorizePanelReleasePublisher,submitPanelReleaseDraft} from "@/lib/panel-release";
import {syncOrbitfsReleaseBundle} from "@/lib/orbitfs-release-bundle";

export const runtime="nodejs";

export async function POST(req:Request){
  const auth=await authorizePanelReleasePublisher(req);
  if(!auth.ok)return reply({error:auth.error,code:auth.code},auth.status);
  try{
    const version=String(req.headers.get("x-orbitfs-release-version")||"").trim();
    const sha256=String(req.headers.get("x-orbitfs-release-sha256")||"").trim().toLowerCase()||null;
    const sourceCommit=String(req.headers.get("x-orbitfs-release-commit")||"").trim()||null;
    const channel=String(req.headers.get("x-orbitfs-release-channel")||"base").trim();
    const components=String(req.headers.get("x-orbitfs-release-components")||"").trim()||null;
    const minimumVersion=String(req.headers.get("x-orbitfs-release-minimum-version")||"").trim()||null;
    const rollbackVersion=String(req.headers.get("x-orbitfs-release-rollback-version")||"").trim()||null;
    const engineDeployerProtocol=Math.max(1,Number(req.headers.get("x-orbitfs-engine-deployer-protocol")||1));
    if(!Number.isInteger(engineDeployerProtocol)||engineDeployerProtocol>100)return reply({error:"Engine deployer protocol header is invalid",code:"PANEL_RELEASE_PROTOCOL_INVALID"},400);
    if(!version)return reply({error:"Panel release version header is required",code:"PANEL_RELEASE_VERSION_REQUIRED"},400);
    const release=await submitPanelReleaseDraft(Buffer.from(await req.arrayBuffer()),{version,sha256,sourceCommit,channel,components,minimumVersion,rollbackVersion});
    const bundle=await syncOrbitfsReleaseBundle({panel:release,components:release.components,engineDeployerProtocol});
    return reply({ok:true,status:"draft",release,bundle});
  }catch(e:any){return reply({error:e?.message||"Panel release candidate upload failed",code:"PANEL_RELEASE_DRAFT_ERROR"},400)}
}
export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}
