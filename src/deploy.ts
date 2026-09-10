import { json, now, type Env } from "./types";
import { requireRole } from "./auth";

async function audit(env:Env,id:string,action:string,actor:string,detail?:unknown){
  await env.DB.prepare("INSERT INTO audit_log (id,entity_type,entity_id,action,actor_ref,detail,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),"deployment",id,action,actor,detail==null?null:JSON.stringify(detail),now()).run();
}

export async function createDeployment(request:Request,env:Env){
  const role=requireRole(request,env,["master","billing"]);if(!role)return json({error:"Unauthorized"},401);
  const b=await request.json().catch(()=>({})) as Record<string,unknown>;
  const licenceId=String(b.licenceId||""),releaseId=String(b.releaseId||""),installationId=String(b.installationId||"");
  if(!licenceId||!releaseId||!installationId)return json({error:"licenceId, releaseId and installationId are required"},400);
  const licence=await env.DB.prepare("SELECT id,status FROM licences WHERE id=?").bind(licenceId).first<any>();
  const release=await env.DB.prepare("SELECT id,component,status,version FROM releases WHERE id=?").bind(releaseId).first<any>();
  if(!licence)return json({error:"Licence not found"},404);if(licence.status!=="active")return json({error:"Licence is not active"},409);
  if(!release)return json({error:"Release not found"},404);if(release.status!=="published")return json({error:"Release is not deployable",status:release.status},409);
  const installation=await env.DB.prepare("SELECT * FROM installations WHERE licence_id=? AND installation_ref=? AND component=? AND status='active' LIMIT 1")
    .bind(licenceId,installationId,release.component).first<any>();
  const component=await env.DB.prepare("SELECT enabled,installation_id FROM licence_components WHERE licence_id=? AND component=? LIMIT 1")
    .bind(licenceId,release.component).first<any>();
  if(!component||Number(component.enabled)!==1)return json({error:"Release component is not licensed"},403);
  if(component.installation_id!==installationId)return json({error:"Installation is not bound to this component"},403);
  if(!installation)return json({error:"Installation not found"},404);
  const duplicate=await env.DB.prepare("SELECT * FROM deployment_jobs WHERE installation_id=? AND release_id=? AND status IN ('queued','running') LIMIT 1").bind(installationId,releaseId).first<any>();
  if(duplicate)return json({job:duplicate,idempotent:true});
  const id=crypto.randomUUID(),stamp=now();
  await env.DB.prepare(`INSERT INTO deployment_jobs
    (id,licence_id,release_id,installation_id,action,status,requested_by,progress,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,licenceId,releaseId,installationId,"deploy","queued",String(b.actorRef||role),0,stamp,stamp).run();
  await audit(env,id,"queued",String(b.actorRef||role),{releaseId,installationId});
  return json({job:await env.DB.prepare("SELECT * FROM deployment_jobs WHERE id=?").bind(id).first<any>()},202);
}

export async function deploymentStatus(request:Request,env:Env,id:string){
  if(!requireRole(request,env,["master","billing","deployer"]))return json({error:"Unauthorized"},401);
  const job=await env.DB.prepare("SELECT * FROM deployment_jobs WHERE id=?").bind(id).first<any>();return job?json({job}):json({error:"Job not found"},404);
}

export async function listDeployments(request:Request,env:Env){
  if(!requireRole(request,env,["master","billing","deployer"]))return json({error:"Unauthorized"},401);
  const url=new URL(request.url),status=url.searchParams.get("status"),installation=url.searchParams.get("installationId");
  let sql="SELECT * FROM deployment_jobs WHERE 1=1",args:any[]=[];
  if(status){sql+=" AND status=?";args.push(status);}if(installation){sql+=" AND installation_id=?";args.push(installation);}
  const rows=await env.DB.prepare(sql+" ORDER BY created_at DESC LIMIT 200").bind(...args).all<any>();return json({jobs:rows.results||[]});
}

export async function updateDeployment(request:Request,env:Env,id:string){
  if(!requireRole(request,env,["deployer","master"]))return json({error:"Unauthorized"},401);
  const job=await env.DB.prepare("SELECT * FROM deployment_jobs WHERE id=?").bind(id).first<any>();if(!job)return json({error:"Job not found"},404);
  const b=await request.json().catch(()=>({})) as Record<string,unknown>,status=String(b.status||"");
  if(!["running","succeeded","failed","cancelled"].includes(status))return json({error:"Invalid deployment status"},400);
  if(["succeeded","failed","cancelled"].includes(job.status))return json({error:"Deployment is already complete",status:job.status},409);
  const stamp=now(),progress=Math.max(0,Math.min(100,Number(b.progress??(status==="succeeded"?100:job.progress))));
  await env.DB.prepare(`UPDATE deployment_jobs SET status=?,progress=?,message=?,error=?,result_json=?,started_at=COALESCE(started_at,?),completed_at=?,updated_at=? WHERE id=?`)
    .bind(status,progress,b.message?String(b.message):null,status==="failed"?String(b.error||"Deployment failed"):null,b.result?JSON.stringify(b.result):null,
      status==="running"?stamp:job.started_at,status==="running"?null:stamp,stamp,id).run();
  await audit(env,id,status,String(b.actorRef||"deployer"),b);
  return json({job:await env.DB.prepare("SELECT * FROM deployment_jobs WHERE id=?").bind(id).first<any>()});
}

export async function cancelDeployment(request:Request,env:Env,id:string){
  if(!requireRole(request,env,["master","billing"]))return json({error:"Unauthorized"},401);
  const job=await env.DB.prepare("SELECT * FROM deployment_jobs WHERE id=?").bind(id).first<any>();if(!job)return json({error:"Job not found"},404);
  if(!["queued","running"].includes(job.status))return json({error:"Deployment cannot be cancelled",status:job.status},409);
  const stamp=now();await env.DB.prepare("UPDATE deployment_jobs SET status='cancelled',completed_at=?,updated_at=? WHERE id=?").bind(stamp,stamp,id).run();
  await audit(env,id,"cancelled",String(request.headers.get("x-actor-ref")||"master"));return deploymentStatus(request,env,id);
}
