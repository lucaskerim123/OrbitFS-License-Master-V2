import {bodyOf,cors,reply} from "@/lib/license-api";
import {authorizePanelRelease,latestPanelRelease,normalizePanelReleaseChannel} from "@/lib/panel-release";

export const runtime="nodejs";

export async function POST(req:Request){
  try{
    const body=await bodyOf(req);
    const auth=await authorizePanelRelease(body);
    if(!auth.ok)return reply({error:auth.error,code:auth.code},auth.status);
    const channel=normalizePanelReleaseChannel(body?.channel||"base"),release=await latestPanelRelease(channel);
    return reply({
      release:{
        version:release.version,releaseId:release.releaseId,sourceCommit:release.sourceCommit,sha256:release.sha256,size:release.size,fileCount:release.fileCount,downloadUrl:release.downloadUrl,expiresIn:release.expiresIn,projectSettings:release.projectSettings,
        channel:release.channel,status:release.status,title:release.title,description:release.description,changelog:release.changelog,customerNotes:release.customerNotes,severity:release.severity,required:release.required,minimumVersion:release.minimumVersion,rollbackVersion:release.rollbackVersion,rollout:release.rollout,components:release.components,schemaVersion:release.schemaVersion,publishedAt:release.publishedAt,
        distribution:"orbitfs-store-package-v1"
      },
      installationId:auth.installationId,
      entitledComponent:auth.entitledComponent
    });
  }catch(e:any){
    return reply({error:e?.message||"Panel release service failed",code:"PANEL_RELEASE_SERVICE_ERROR"},500);
  }
}

export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}
