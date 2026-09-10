import { json, type Env } from "./types";
import { issue } from "./license";
import { validate } from "./runtime";
import { publicSigningPem } from "./crypto";
import { releases, publishRelease, artifact, releaseArtifactDownload, controlRelease } from "./release";
import { deployment } from "./deploy";
import { control } from "./control";

function cors(request: Request) { const origin=request.headers.get("origin")||"*"; return {"access-control-allow-origin":origin,"access-control-allow-headers":"content-type,authorization,x-orbitfs-order-ref","access-control-allow-methods":"GET,POST,OPTIONS","vary":"origin"}; }
function routeRelease(path:string){const m=path.match(/^\/api\/v1\/releases\/([^/]+)(?:\/(artifact|publish|control))?$/);return m?{id:decodeURIComponent(m[1]),action:m[2]||""}:null;}

export default { async fetch(request:Request,env:Env){
  const url=new URL(request.url);if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
  try{let response:Response;const release=routeRelease(url.pathname);
    if(url.pathname==="/health")response=json({ok:true,service:"orbitfs-license-master-v2",version:"2.0.0"});
    else if(url.pathname==="/api/v1/license/public-key"&&request.method==="GET")response=new Response(await publicSigningPem(env),{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
    else if(url.pathname==="/api/v1/license/validate"&&request.method==="POST")response=await validate(request,env);
    else if(url.pathname==="/api/v1/license/issue"&&request.method==="POST")response=await issue(request,env);
    else if(url.pathname==="/api/v1/releases"&&["GET","POST"].includes(request.method))response=await releases(request,env);
    else if(release?.action==="artifact"&&request.method==="POST")response=await artifact(request,env,release.id);
    else if(release?.action==="artifact"&&request.method==="GET")response=await releaseArtifactDownload(request,env,release.id);
    else if(release?.action==="publish"&&request.method==="POST")response=await publishRelease(request,env,release.id);
    else if(release?.action==="control"&&request.method==="POST")response=await controlRelease(request,env,release.id);
    else if(url.pathname==="/api/v1/deployments"&&request.method==="POST")response=await deployment(request,env);
    else if(url.pathname.match(/^\/api\/v1\/license\/[^/]+\/control$/)&&request.method==="POST")response=await control(request,env,url.pathname.split("/")[4]);
    else response=json({error:"Not found"},404);
    return new Response(response.body,{status:response.status,headers:{"content-type":response.headers.get("content-type")||"application/json",...cors(request)}});
  }catch(error){return json({error:"Master service error",detail:String((error as Error)?.message||error)},500,cors(request));}
} };
