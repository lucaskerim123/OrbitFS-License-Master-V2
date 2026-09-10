import { json, type Env } from "./types";
import { issue, listLicences, getLicence, controlLicence } from "./license";
import { validate, heartbeat } from "./runtime";
import { publicSigningPem } from "./crypto";
import { releases, validateRelease, publishRelease, artifact, releaseArtifactDownload, controlRelease } from "./release";
import { createDeployment, listDeployments, deploymentStatus, updateDeployment, cancelDeployment } from "./deploy";
import { auditLog, installations } from "./audit";

function cors(request:Request){
  const origin=request.headers.get("origin")||"*";
  return {"access-control-allow-origin":origin,"access-control-allow-headers":"content-type,authorization,x-orbitfs-order-ref,x-artifact-sha256,x-actor-ref",
    "access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","vary":"origin"};
}
function jsonResponse(response:Response,request:Request){return new Response(response.body,{status:response.status,headers:{"content-type":response.headers.get("content-type")||"application/json",...cors(request)}});}

export default {async fetch(request:Request,env:Env){
  const url=new URL(request.url);if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
  try{
    let response:Response;
    const licenceControl=url.pathname.match(/^\/api\/v1\/license\/([^/]+)\/control$/);
    const licenceGet=url.pathname.match(/^\/api\/v1\/license\/([^/]+)$/);
    const licenceHeartbeat=url.pathname.match(/^\/api\/v1\/license\/([^/]+)\/heartbeat$/);
    const releaseRoute=url.pathname.match(/^\/api\/v1\/releases\/([^/]+)(?:\/(artifact|validate|publish|control))?$/);
    const deploymentRoute=url.pathname.match(/^\/api\/v1\/deployments(?:\/([^/]+))?$/);
    if(url.pathname==="/health"&&request.method==="GET")response=json({ok:true,service:"orbitfs-license-master-v2",version:"2.0.0"});
    else if(url.pathname==="/api/v1/license/public-key"&&request.method==="GET")response=new Response(await publicSigningPem(env),{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
    else if(url.pathname==="/api/v1/license/validate"&&request.method==="POST")response=await validate(request,env);
    else if(url.pathname==="/api/v1/license/issue"&&request.method==="POST")response=await issue(request,env);
    else if(url.pathname==="/api/v1/licenses"&&request.method==="GET")response=await listLicences(request,env);
    else if(url.pathname==="/api/v1/installations"&&request.method==="GET")response=await installations(request,env);
    else if(url.pathname==="/api/v1/audit"&&request.method==="GET")response=await auditLog(request,env);
    else if(licenceHeartbeat&&request.method==="POST")response=await heartbeat(request,env,decodeURIComponent(licenceHeartbeat[1]));
    else if(licenceControl&&request.method==="POST")response=await controlLicence(request,env,decodeURIComponent(licenceControl[1]));
    else if(licenceGet&&request.method==="GET")response=await getLicence(request,env,decodeURIComponent(licenceGet[1]));
    else if(url.pathname==="/api/v1/releases"&&["GET","POST"].includes(request.method))response=await releases(request,env);
    else if(releaseRoute?.[2]==="artifact"&&request.method==="POST")response=await artifact(request,env,decodeURIComponent(releaseRoute[1]));
    else if(releaseRoute?.[2]==="artifact"&&request.method==="GET")response=await releaseArtifactDownload(request,env,decodeURIComponent(releaseRoute[1]));
    else if(releaseRoute?.[2]==="validate"&&request.method==="POST")response=await validateRelease(request,env,decodeURIComponent(releaseRoute[1]));
    else if(releaseRoute?.[2]==="publish"&&request.method==="POST")response=await publishRelease(request,env,decodeURIComponent(releaseRoute[1]));
    else if(releaseRoute?.[2]==="control"&&request.method==="POST")response=await controlRelease(request,env,decodeURIComponent(releaseRoute[1]));
    else if(url.pathname==="/api/v1/deployments"&&request.method==="POST")response=await createDeployment(request,env);
    else if(url.pathname==="/api/v1/deployments"&&request.method==="GET")response=await listDeployments(request,env);
    else if(deploymentRoute?.[1]&&request.method==="GET")response=await deploymentStatus(request,env,decodeURIComponent(deploymentRoute[1]));
    else if(deploymentRoute?.[1]&&request.method==="PATCH")response=await updateDeployment(request,env,decodeURIComponent(deploymentRoute[1]));
    else if(deploymentRoute?.[1]&&request.method==="DELETE")response=await cancelDeployment(request,env,decodeURIComponent(deploymentRoute[1]));
    else response=json({error:"Not found"},404);
    return jsonResponse(response,request);
  }catch(error){return json({error:"Master service error",detail:String((error as Error)?.message||error)},500,cors(request));}
}};
