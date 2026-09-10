import { randomUUID, createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: { rejectUnauthorized: false } });
const MASTER = process.env.MASTER_API_TOKEN || "";
const BILLING = process.env.BILLING_API_TOKEN || "";
const DEPLOYER = process.env.DEPLOYER_API_TOKEN || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PRIVATE_KEY = process.env.ENTITLEMENT_PRIVATE_KEY_B64 || "";
const COMPONENTS = ["orbitfs_base", "orbitfs_mcp", "orbitfs_apex", "orbitfs_studio"] as const;

type Role = "master" | "billing" | "deployer";
const json = (res: ServerResponse, status: number, body: unknown) => { res.statusCode=status; res.setHeader("content-type","application/json"); res.setHeader("cache-control","no-store"); res.end(JSON.stringify(body)); };
const bearer = (req: IncomingMessage) => { const v=String(req.headers.authorization||""); return v.startsWith("Bearer ") ? v.slice(7).trim() : ""; };
const role = (req: IncomingMessage): Role|null => { const t=bearer(req); if(t&&t===MASTER)return "master"; if(t&&t===BILLING)return "billing"; if(t&&t===DEPLOYER)return "deployer"; return null; };
const allowed = (req: IncomingMessage, roles: Role[]) => { const r=role(req); return r&&roles.includes(r); };
const body = (req: IncomingMessage) => new Promise<any>((resolve,reject)=>{const c:Buffer[]=[];req.on("data",x=>c.push(Buffer.from(x)));req.on("end",()=>{try{resolve(c.length?JSON.parse(Buffer.concat(c).toString()):{});}catch{resolve({});}});req.on("error",reject);});
const hash = (v:string) => createHash("sha256").update(v).digest("hex");
const key = () => { const r=randomUUID().replaceAll("-","").toUpperCase(); return `OFS-${r.slice(0,4)}-${r.slice(4,8)}-${r.slice(8,12)}-${r.slice(12,16)}`; };
const audit = async (type:string,id:string,action:string,actor:string,detail:any={}) => { await db.query("insert into audit_log(id,entity_type,entity_id,action,actor_ref,detail) values($1,$2,$3,$4,$5,$6)",[randomUUID(),type,id,action,actor,detail]); };
const privatePem = () => PRIVATE_KEY ? Buffer.from(PRIVATE_KEY,"base64").toString("utf8") : "";
const publicPem = () => { const p=privatePem(); if(!p)return ""; return createPublicKey(createPrivateKey(p)).export({type:"spki",format:"pem"}).toString(); };
const entitlement = (payload:any) => { const p=privatePem(); if(!p)throw new Error("ENTITLEMENT_PRIVATE_KEY_B64 is not configured"); const h=Buffer.from(JSON.stringify({alg:"RS256",typ:"JWT"})).toString("base64url"),b=Buffer.from(JSON.stringify(payload)).toString("base64url"),input=`${h}.${b}`,s=sign("RSA-SHA256",Buffer.from(input),createPrivateKey(p)).toString("base64url"); return `${input}.${s}`; };

async function issue(req:IncomingMessage,res:ServerResponse){
  if(!allowed(req,["billing","master"]))return json(res,401,{error:"Unauthorized"}); const b=await body(req), order=String(b.orderRef||req.headers["x-orbitfs-order-ref"]||"").trim(); if(!order)return json(res,400,{error:"orderRef is required"});
  const old=(await db.query("select * from license_bindings where order_ref=$1 and archived_at is null limit 1",[order])).rows[0]; if(old)return json(res,200,{licence:old,idempotent:true});
  const id=randomUUID(), licenseKey=key(), components=(b.components&&typeof b.components==="object")?b.components:{};
  const r=(await db.query("insert into license_bindings(id,customer_ref,order_ref,product_code,status,desired_state,remote_state,expires_at,max_installations,components,metadata,license_key_hash,license_key_last4,notes) values($1,$2,$3,$4,'active','active','active',$5,$6,$7,$8,$9,$10,$11) returning *",[id,String(b.customerRef||""),order,String(b.productCode||"orbitfs_base"),b.expiresAt||null,Math.max(1,Math.min(100,Number(b.maxInstallations||1))),components,b.metadata||{},hash(licenseKey),licenseKey.slice(-4),b.notes||null])).rows[0];
  await db.query("insert into license_key_delivery(binding_id,customer_ref,license_key) values($1,$2,$3)",[id,String(b.customerRef||""),licenseKey]);
  await db.query("insert into license_fulfillments(order_ref,customer_ref,product_code,state,binding_id,license_id,fulfilled_at,metadata) values($1,$2,$3,'fulfilled',$4,$4,now(),$5) on conflict(order_ref) do nothing",[order,String(b.customerRef||""),String(b.productCode||"orbitfs_base"),id,{components}]);
  await audit("licence",id,"issued",String(b.actorRef||role(req)),{orderRef:order}); return json(res,201,{licence:r,licenceKey:licenseKey,status:"active"});
}

async function validate(req:IncomingMessage,res:ServerResponse){
  const b=await body(req), licenseKey=String(b.licenseKey||b.license_key||"").trim(), installation=String(b.installationId||b.installation_id||"").trim(); if(!licenseKey||!installation)return json(res,400,{error:"licenseKey and installationId are required"});
  const binding=(await db.query("select * from license_bindings where license_key_hash=$1 and archived_at is null limit 1",[hash(licenseKey)])).rows[0]; if(!binding)return json(res,404,{error:"Licence not found",code:"LICENSE_NOT_FOUND"});
  const expired=binding.expires_at&&new Date(binding.expires_at).getTime()<=Date.now(), state=expired?"expired":binding.status, requested=Array.isArray(b.components)?b.components.map(String):[...COMPONENTS], result:any={};
  for(const requestedName of requested){ const c=requestedName==="orbitfs_panel"?"orbitfs_base":requestedName==="orbitfs_sorter"?"orbitfs_apex":requestedName; const enabled=binding.components?.[c]===true||c==="orbitfs_base"&&Object.keys(binding.components||{}).length===0; let inst=(await db.query("select * from license_installations where binding_id=$1 and component_key=$2 and installation_id=$3 limit 1",[binding.id,c,installation])).rows[0];
    if(state==="active"&&enabled&&b.activate===true&&!inst){const count=Number((await db.query("select count(distinct installation_id) count from license_installations where binding_id=$1 and status='active'",[binding.id])).rows[0]?.count||0);if(count>=Number(binding.max_installations||1))return json(res,409,{error:"Installation limit reached",code:"INSTALLATION_LIMIT"});await db.query("insert into license_installations(id,binding_id,component_key,installation_id,device_name,platform,app_version,status,registered_at,last_seen_at,locked_at,metadata) values($1,$2,$3,$4,$5,$6,$7,'active',now(),now(),now(),$8)",[randomUUID(),binding.id,c,installation,b.deviceName||null,b.platform||null,b.appVersion||null,b.metadata||{}]);inst=(await db.query("select * from license_installations where binding_id=$1 and component_key=$2 and installation_id=$3 limit 1",[binding.id,c,installation])).rows[0];}
    const ok=state==="active"&&enabled&&!!inst; result[requestedName]={allowed:ok,state:!enabled?"blocked":state!=="active"?state:ok?"locked":"blocked",lockedToThisInstallation:!!inst,reason:!enabled?"not_included":state!=="active"?state:ok?null:"activation_required"};
  }
  await db.query("insert into license_validation_log(binding_id,license_id,installation_id,result,reason) values($1,$2,$3,$4,$5)",[binding.id,binding.id,installation,state==="active"?"allowed":"denied",state==="active"?null:state]);
  const settings=(await db.query("select * from master_license_settings where id='primary'")).rows[0],iat=Math.floor(Date.now()/1000),ttl=Number(settings?.entitlement_ttl_seconds||10800),grace=Number(settings?.grace_seconds||604800);
  return json(res,200,{valid:state==="active",reason:state==="active"?null:state,components:result,entitlement:entitlement({iss:settings?.issuer||"orbitfs-license-master",aud:settings?.audience||"orbitfs-runtime",iat,exp:iat+ttl,graceUntil:iat+ttl+grace,valid:state==="active",reason:state==="active"?null:state,licenceId:binding.id,installationId:installation,components:result})});
}

async function control(req:IncomingMessage,res:ServerResponse,id:string){
  if(!allowed(req,["master"]))return json(res,401,{error:"Unauthorized"}); const b=await body(req),action=String(b.action||""); if(!["activate","suspend","terminate","unblock","unlock","set_component","set_expiry"].includes(action))return json(res,400,{error:"Invalid action"});
  const row=(await db.query("select * from license_bindings where id=$1 and archived_at is null",[id])).rows[0];if(!row)return json(res,404,{error:"Licence not found"});
  if(action==="unlock")await db.query("update license_installations set installation_id=null,status='inactive',locked_at=null where binding_id=$1",[id]);
  else if(action==="set_expiry")await db.query("update license_bindings set expires_at=$1,updated_at=now() where id=$2",[b.expiresAt||null,id]);
  else if(action==="set_component")await db.query("update license_bindings set components=jsonb_set(components,$1,to_jsonb($2::boolean),true),updated_at=now() where id=$3",[[String(b.component||"")],b.enabled===true,id]);
  else {const status=action==="suspend"?"suspended":action==="terminate"?"terminated":"active";await db.query("update license_bindings set status=$1,desired_state=$1,remote_state=$1,updated_at=now() where id=$2",[status,id]);}
  await audit("licence",id,action,String(b.actorRef||"master"),{reason:b.reason||null});return json(res,200,{ok:true,licenceId:id,action});
}

async function releases(req:IncomingMessage,res:ServerResponse){
  if(req.method==="GET"){const rows=(await db.query("select * from releases order by updated_at desc limit 500")).rows;return json(res,200,{releases:rows});}
  if(!allowed(req,["master"]))return json(res,401,{error:"Unauthorized"}); const b=await body(req),version=String(b.version||"").trim(),component=String(b.component||"orbitfs_base");if(!version)return json(res,400,{error:"version is required"});
  const existing=(await db.query("select * from releases where component=$1 and channel=$2 and version=$3 limit 1",[component,String(b.channel||"stable"),version])).rows[0];if(existing)return json(res,200,{release:existing,idempotent:true});
  const r=(await db.query("insert into releases(id,component,version,channel,status,title,description,changelog,customer_notes,internal_notes,severity,required,rollout,minimum_version,rollback_version,schema_version,checkpoint_required,components,manifest,permissions,compatibility,source_commit) values($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning *",[randomUUID(),component,version,String(b.channel||"stable"),String(b.title||`OrbitFS ${version}`),String(b.description||""),String(b.changelog||""),String(b.customerNotes||""),String(b.internalNotes||""),String(b.severity||"normal"),!!b.required,String(b.rollout||"public"),b.minimumVersion||null,b.rollbackVersion||null,String(b.schemaVersion||"1"),!!b.checkpointRequired,b.components||[],b.manifest||{},b.permissions||{},b.compatibility||{},b.sourceCommit||null])).rows[0];await audit("release",r.id,"draft_created",String(b.actorRef||"master"),{component,version});return json(res,201,{release:r});
}

async function releaseAction(req:IncomingMessage,res:ServerResponse,id:string,action:string){
  if(!allowed(req,["master"]))return json(res,401,{error:"Unauthorized"}); const row=(await db.query("select * from releases where id=$1",[id])).rows[0];if(!row)return json(res,404,{error:"Release not found"});
  if(action==="publish"){if(!row.artifact_path)return json(res,409,{error:"Release artifact must be uploaded before publishing"});if(row.status!=="validated")return json(res,409,{error:"Release must be validated before publishing",status:row.status});await db.query("update releases set status='published',published_at=now(),published_by=$1,updated_at=now() where id=$2",[req.headers["x-actor-ref"]||"master",id]);}
  else if(["paused","withdrawn"].includes(action))await db.query("update releases set status=$1,updated_at=now() where id=$2",[action,id]);
  else if(action==="validate"){if(!row.artifact_path||!row.artifact_sha256)return json(res,422,{valid:false,errors:["artifact_required"]});await db.query("update releases set status='validated',updated_at=now() where id=$1",[id]);}
  await audit("release",id,action,String(req.headers["x-actor-ref"]||"master"));return json(res,200,{release:(await db.query("select * from releases where id=$1",[id])).rows[0],deploysAutomatically:false});
}

async function artifact(req:IncomingMessage,res:ServerResponse,id:string){
  if(!allowed(req,["master"]))return json(res,401,{error:"Unauthorized"}); if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)return json(res,503,{error:"Supabase storage is not configured"});
  const row=(await db.query("select * from releases where id=$1",[id])).rows[0];if(!row)return json(res,404,{error:"Release not found"});const chunks:Buffer[]=[];for await(const c of req as any)chunks.push(Buffer.from(c));const bytes=Buffer.concat(chunks);if(!bytes.length||bytes.length>100*1024*1024)return json(res,400,{error:"Artifact size is invalid"});
  const digest=createHash("sha256").update(bytes).digest("hex"),expected=String(req.headers["x-artifact-sha256"]||"").toLowerCase();if(expected&&expected!==digest)return json(res,400,{error:"Artifact SHA-256 mismatch",expected,actual:digest});
  const path=`releases/${row.component}/${row.channel}/${row.version}/artifact.bin`, url=`${SUPABASE_URL}/storage/v1/object/orbitfs-license-master-releases/${path}`;
  const upload=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,apikey:SUPABASE_SERVICE_ROLE_KEY,"Content-Type":String(req.headers["content-type"]||"application/octet-stream"),"x-upsert":"true"},body:bytes});if(!upload.ok)return json(res,502,{error:"Artifact storage failed",detail:await upload.text()});
  const fresh=(await db.query("update releases set artifact_path=$1,artifact_sha256=$2,artifact_size=$3,artifact_content_type=$4,updated_at=now() where id=$5 returning *",[path,digest,bytes.length,req.headers["content-type"]||"application/octet-stream",id])).rows[0];await audit("release",id,"artifact_uploaded",String(req.headers["x-actor-ref"]||"master"),{sha256:digest,size:bytes.length});return json(res,200,{release:fresh});
}

async function latest(req:IncomingMessage,res:ServerResponse){const u=new URL(req.url||"/","http://localhost"),component=u.searchParams.get("component")||"orbitfs_base",channel=u.searchParams.get("channel")||"stable",r=(await db.query("select * from releases where component=$1 and channel=$2 and status='published' order by published_at desc limit 1",[component,channel])).rows[0];return r?json(res,200,{release:r}):json(res,404,{error:"No published release"});}
async function deployments(req:IncomingMessage,res:ServerResponse,id?:string){
  if(!allowed(req,["master","billing","deployer"]))return json(res,401,{error:"Unauthorized"});
  if(req.method==="GET"&&id){const r=(await db.query("select * from deployment_jobs where id=$1",[id])).rows[0];return r?json(res,200,{job:r}):json(res,404,{error:"Job not found"});}
  if(req.method==="GET"){const r=(await db.query("select * from deployment_jobs order by created_at desc limit 200")).rows;return json(res,200,{jobs:r});}
  if(!allowed(req,["master","billing"]))return json(res,401,{error:"Unauthorized"});const b=await body(req),installationId=String(b.installationId||""),releaseId=String(b.releaseId||"");if(!installationId||!releaseId)return json(res,400,{error:"installationId and releaseId are required"});
  const i=(await db.query("select * from orbitfs_installations where id=$1",[installationId])).rows[0],r=(await db.query("select * from releases where id=$1",[releaseId])).rows[0];if(!i)return json(res,404,{error:"Installation not found"});if(!r)return json(res,404,{error:"Release not found"});if(r.status!=="published")return json(res,409,{error:"Release is not deployable"});
  const j=(await db.query("insert into deployment_jobs(id,installation_id,user_ref,binding_id,release_id,action,status,requested_by,progress,message) values($1,$2,$3,$4,$5,'deploy','queued',$6,0,'Deployment queued') returning *",[randomUUID(),installationId,i.user_ref,i.binding_id,releaseId,String(b.actorRef||role(req))])).rows[0];await audit("deployment",j.id,"queued",String(b.actorRef||role(req)),{releaseId,installationId});return json(res,202,{job:j});
}
export async function handler(req:IncomingMessage,res:ServerResponse){
  res.setHeader("access-control-allow-origin",String(req.headers.origin||"*"));res.setHeader("access-control-allow-headers","content-type,authorization,x-orbitfs-order-ref,x-artifact-sha256,x-actor-ref");res.setHeader("access-control-allow-methods","GET,POST,PATCH,DELETE,OPTIONS");
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  try{
    const u=new URL(req.url||"/","http://localhost"),p=u.pathname;
    if(p==="/health")return json(res,200,{ok:true,service:"OrbitFS License Master",version:"2.0.0",database:(await db.query("select 1")).rowCount===1,signingConfigured:!!privatePem()});
    if(p==="/api/v1/license/public-key")return res.end(publicPem());
    if(p==="/api/v1/license/validate"&&req.method==="POST")return validate(req,res);
    if(p==="/api/v1/license/issue"&&req.method==="POST")return issue(req,res);
    if(p==="/api/v1/licenses"&&req.method==="GET"){if(!allowed(req,["master","billing"]))return json(res,401,{error:"Unauthorized"});return json(res,200,{licenses:(await db.query("select * from license_bindings where archived_at is null order by created_at desc limit 500")).rows});}
    const lc=p.match(/^\/api\/v1\/license\/([^/]+)\/control$/);if(lc&&req.method==="POST")return control(req,res,decodeURIComponent(lc[1]));
    if(p==="/api/v1/releases"&&(req.method==="GET"||req.method==="POST"))return releases(req,res);
    const ra=p.match(/^\/api\/v1\/releases\/([^/]+)\/(artifact|validate|publish|control)$/);if(ra&&req.method==="POST")return ra[2]==="artifact"?artifact(req,res,decodeURIComponent(ra[1])):releaseAction(req,res,decodeURIComponent(ra[1]),ra[2]);
    if(p==="/api/v1/releases/latest"&&req.method==="GET")return latest(req,res);
    const dj=p.match(/^\/api\/v1\/deployments(?:\/([^/]+))?$/);if(dj)return deployments(req,res,dj[1]?decodeURIComponent(dj[1]):undefined);
    return json(res,404,{error:"Not found"});
  }catch(e:any){console.error(e);return json(res,500,{error:"Master service error",detail:e?.message||String(e)});}
}

if(process.env.NODE_ENV!=="production"){
  const {createServer}=await import("node:http");createServer(handler).listen(Number(process.env.PORT||3000),()=>console.log("OrbitFS License Master listening"));
}


