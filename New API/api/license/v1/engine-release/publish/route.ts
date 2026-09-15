import {cors,reply} from "@/lib/license-api";
import {authorizeReleasePublisher,submitEngineReleaseDraft} from "@/lib/engine-release";

export const runtime="nodejs";

export async function POST(req:Request){
  const auth=await authorizeReleasePublisher(req);
  if(!auth.ok)return reply({error:auth.error,code:auth.code},auth.status);
  try{
    const version=String(req.headers.get("x-orbitfs-release-version")||"").trim();
    const sha256=String(req.headers.get("x-orbitfs-release-sha256")||"").trim().toLowerCase()||null;
    const sourceCommit=String(req.headers.get("x-orbitfs-release-commit")||"").trim()||null;
    if(!version)return reply({error:"Engine release version header is required",code:"ENGINE_RELEASE_VERSION_REQUIRED"},400);
    const release=await submitEngineReleaseDraft(Buffer.from(await req.arrayBuffer()),{version,sha256,sourceCommit});
    return reply({ok:true,status:release.status,release});
  }catch(e:any){return reply({error:e?.message||"Engine release candidate upload failed",code:"ENGINE_RELEASE_DRAFT_ERROR"},400)}
}
export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}
