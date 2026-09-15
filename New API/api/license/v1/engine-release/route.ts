import {bodyOf,cors,reply} from "@/lib/license-api";
import {authorizeEngineRelease,latestEngineRelease} from "@/lib/engine-release";
import {getOrbitfsReleaseBundle} from "@/lib/orbitfs-release-bundle";

export const runtime="nodejs";

export async function POST(req:Request){
  try{
    const body=await bodyOf(req);
    const auth=await authorizeEngineRelease(body);
    if(!auth.ok)return reply({error:auth.error,code:auth.code},auth.status);
    const release=await latestEngineRelease();
    const bundle=await getOrbitfsReleaseBundle(release.version).catch(()=>null);
    return reply({
      release:{
        version:release.version,
        releaseId:release.releaseId,
        sourceCommit:release.sourceCommit,
        sha256:release.sha256,
        size:release.size,
        fileCount:release.fileCount,
        downloadUrl:release.downloadUrl,
        expiresIn:release.expiresIn,
        projectSettings:release.projectSettings,
        components:release.components||[],
        checkpointRequired:release.checkpointRequired!==false,
        minimumEngineDeployerProtocol:Math.max(1,Number(release.minimumEngineDeployerProtocol||bundle?.minimumEngineDeployerProtocol||1)),
        distribution:"orbitfs-store-package-v1"
      },
      installationId:auth.installationId,
      entitledComponents:auth.entitled
    });
  }catch(e:any){
    return reply({error:e?.message||"Engine release service failed",code:"ENGINE_RELEASE_SERVICE_ERROR"},500);
  }
}

export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}
