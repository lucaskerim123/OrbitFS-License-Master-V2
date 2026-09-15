import {cors,reply} from "@/lib/license-api";
import {authorizePanelReleasePublisher,submitPanelReleaseDraft} from "@/lib/panel-release";

export const runtime="nodejs";

async function submit(req:Request){
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
    if(!version)return reply({error:"Panel release version header is required",code:"PANEL_RELEASE_VERSION_REQUIRED"},400);
    const bytes=Buffer.from(await req.arrayBuffer());
    const release=await submitPanelReleaseDraft(bytes,{version,sha256,sourceCommit,channel,components,minimumVersion,rollbackVersion});
    return reply({ok:true,status:release.status,release});
  }catch(e:any){return reply({error:e?.message||"Panel release candidate upload failed",code:"PANEL_RELEASE_DRAFT_ERROR"},400)}
}

// Compatibility endpoint: old GitHub Actions still call /publish, but uploads now land as drafts.
export const POST=submit;
export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}
