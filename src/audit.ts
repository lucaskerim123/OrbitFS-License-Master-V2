import { json, type Env } from "./types";
import { requireRole } from "./auth";

export async function auditLog(request:Request,env:Env){
  if(!requireRole(request,env,["master"]))return json({error:"Unauthorized"},401);
  const url=new URL(request.url),type=url.searchParams.get("entityType"),id=url.searchParams.get("entityId"),limit=Math.min(500,Math.max(1,Number(url.searchParams.get("limit")||100)));
  let sql="SELECT * FROM audit_log WHERE 1=1",args:any[]=[];
  if(type){sql+=" AND entity_type=?";args.push(type);}if(id){sql+=" AND entity_id=?";args.push(id);}
  const rows=await env.DB.prepare(sql+" ORDER BY created_at DESC LIMIT ?").bind(...args,limit).all<any>();return json({events:rows.results||[]});
}

export async function installations(request:Request,env:Env){
  if(!requireRole(request,env,["master","billing"]))return json({error:"Unauthorized"},401);
  const url=new URL(request.url),licence=url.searchParams.get("licenceId");
  const rows=licence?await env.DB.prepare("SELECT * FROM installations WHERE licence_id=? ORDER BY last_seen DESC").bind(licence).all<any>()
    :await env.DB.prepare("SELECT * FROM installations ORDER BY last_seen DESC LIMIT 500").all<any>();
  return json({installations:rows.results||[]});
}
