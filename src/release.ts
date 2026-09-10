import { json, now, type Env, COMPONENTS } from "./types";
import { requireRole } from "./auth";
import { sha256 } from "./crypto";

const STATUSES = ["draft", "validated", "published", "paused", "withdrawn", "superseded"] as const;

function validVersion(value: unknown) { return /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(String(value || "")); }
function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function publicRelease(row: any) {
  return { id:row.id, component:row.component, version:row.version, channel:row.channel, status:row.status,
    changelog:row.changelog, manifest:JSON.parse(row.manifest_json || "{}"), permissions:JSON.parse(row.permissions_json || "{}"),
    compatibility:JSON.parse(row.compatibility_json || "{}"), minVersion:row.min_version, maxVersion:row.max_version,
    publishedAt:row.published_at, publishedBy:row.published_by, createdAt:row.created_at, updatedAt:row.updated_at,
    supersedesReleaseId:row.supersedes_release_id,
    artifact:row.artifact_path ? { path:row.artifact_path, sha256:row.artifact_sha256, size:row.artifact_size, contentType:row.artifact_content_type } : null };
}
async function audit(env:Env,id:string,action:string,actor:string,detail?:unknown) {
  await env.DB.prepare("INSERT INTO audit_log (id,entity_type,entity_id,action,actor_ref,detail,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),"release",id,action,actor,detail == null ? null : JSON.stringify(detail),now()).run();
}

export async function releases(request:Request,env:Env) {
  if (request.method === "GET") {
    const url=new URL(request.url), component=url.searchParams.get("component"), channel=url.searchParams.get("channel"), published=url.searchParams.get("published");
    let sql="SELECT * FROM releases WHERE 1=1", args:any[]=[];
    if(component){sql+=" AND component=?";args.push(component);} if(channel){sql+=" AND channel=?";args.push(channel);}
    if(published === "true"){sql+=" AND status='published'";} else if(!requireRole(request,env,["master"])) sql+=" AND status='published'";
    const rows=await env.DB.prepare(sql+" ORDER BY created_at DESC").bind(...args).all<any>();
    return json({ releases:(rows.results||[]).map(publicRelease) });
  }
  if(!requireRole(request,env,["master"])) return json({error:"Unauthorized"},401);
  const b=await request.json().catch(()=>({})) as Record<string,unknown>, version=String(b.version||"").trim(), component=String(b.component||"orbitfs_base").trim();
  if(!validVersion(version)) return json({error:"version is required or invalid"},400);
  if(!(COMPONENTS as readonly string[]).includes(component)) return json({error:"Invalid component"},400);
  const channel=String(b.channel||"stable").trim() || "stable";
  const existing=await env.DB.prepare("SELECT * FROM releases WHERE component=? AND channel=? AND version=? LIMIT 1").bind(component,channel,version).first<any>();
  if(existing) return json({release:publicRelease(existing),idempotent:true});
  const id=crypto.randomUUID(),stamp=now(),manifest=object(b.manifest),permissions=object(b.permissions),compatibility=object(b.compatibility);
  const manifestText=JSON.stringify(manifest);
  await env.DB.prepare(`INSERT INTO releases
    (id,component,version,channel,status,changelog,manifest_json,permissions_json,min_version,max_version,compatibility_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,component,version,channel,"draft",String(b.changelog||""),manifestText,
    JSON.stringify(permissions),b.minVersion ? String(b.minVersion) : null,b.maxVersion ? String(b.maxVersion) : null,
    JSON.stringify(compatibility),stamp,stamp).run();
  const row=await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  await audit(env,id,"created",String(b.actorRef||"master"),{component,version,channel});
  return json({release:publicRelease(row)},201);
}

export async function artifact(request:Request,env:Env,id:string) {
  if(!requireRole(request,env,["master"])) return json({error:"Unauthorized"},401);
  if(!env.RELEASES) return json({error:"Release artifact storage is not configured"},503);
  const row=await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if(!row) return json({error:"Release not found"},404);
  if(row.status === "withdrawn" || row.status === "superseded") return json({error:"Release is closed"},409);
  const bytes=await request.arrayBuffer();
  if(!bytes.byteLength || bytes.byteLength>100*1024*1024) return json({error:"Release artifact size is invalid"},400);
  const digest=await crypto.subtle.digest("SHA-256",bytes), digestHex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
  const expected=String(request.headers.get("x-artifact-sha256")||"").toLowerCase();
  if(expected && expected!==digestHex) return json({error:"Artifact SHA-256 mismatch",expected,actual:digestHex},400);
  const path=`releases/${row.component}/${row.channel}/${row.version}/artifact.bin`;
  await env.RELEASES.put(path,bytes,{httpMetadata:{contentType:request.headers.get("content-type")||"application/octet-stream"}});
  await env.DB.prepare(`UPDATE releases SET artifact_path=?,artifact_sha256=?,artifact_size=?,artifact_content_type=?,updated_at=? WHERE id=?`)
    .bind(path,digestHex,bytes.byteLength,request.headers.get("content-type")||"application/octet-stream",now(),id).run();
  const fresh=await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  await audit(env,id,"artifact_uploaded",request.headers.get("x-actor-ref")||"master",{sha256:digestHex,size:bytes.byteLength});
  return json({release:publicRelease(fresh)});
}

export async function validateRelease(request:Request,env:Env,id:string) {
  if(!requireRole(request,env,["master"])) return json({error:"Unauthorized"},401);
  const row=await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if(!row) return json({error:"Release not found"},404);
  const manifest=JSON.parse(row.manifest_json||"{}"), errors:string[]=[];
  if(!row.artifact_path || !row.artifact_sha256 || !Number(row.artifact_size)) errors.push("artifact_required");
  if(!manifest || typeof manifest!=="object") errors.push("manifest_required");
  if(String(manifest.component||row.component)!==row.component) errors.push("manifest_component_mismatch");
  if(String(manifest.version||row.version)!==row.version) errors.push("manifest_version_mismatch");
  if(errors.length) return json({valid:false,errors},422);
  await env.DB.prepare("UPDATE releases SET status='validated',manifest_sha256=?,updated_at=? WHERE id=?").bind(await sha256(JSON.stringify(manifest)),now(),id).run();
  await audit(env,id,"validated",request.headers.get("x-actor-ref")||"master");
  const fresh=await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  return json({valid:true,release:publicRelease(fresh)});
}

export async function publishRelease(request:Request,env:Env,id:string) {
  if(!requireRole(request,env,["master"])) return json({error:"Unauthorized"},401);
  const row=await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if(!row) return json({error:"Release not found"},404);
  if(!row.artifact_path) return json({error:"Release artifact must be uploaded before publishing"},409);
  if(row.status!=="validated") return json({error:"Release must be validated before publishing",status:row.status},409);
  const b=await request.json().catch(()=>({})) as Record<string,unknown>,stamp=now();
  const supersedes=b.supersedesReleaseId ? String(b.supersedesReleaseId) : null;
  if(supersedes){const old=await env.DB.prepare("SELECT id,status FROM releases WHERE id=?").bind(supersedes).first<any>();if(!old)return json({error:"Superseded release not found"},404);}
  await env.DB.prepare("UPDATE releases SET status='published',published_at=?,published_by=?,supersedes_release_id=?,updated_at=? WHERE id=?")
    .bind(stamp,String(b.actorRef||"master"),supersedes,stamp,id).run();
  if(supersedes) await env.DB.prepare("UPDATE releases SET status='superseded',updated_at=? WHERE id=? AND status='published'").bind(stamp,supersedes).run();
  await audit(env,id,"published",String(b.actorRef||"master"),{supersedesReleaseId:supersedes});
  const fresh=await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  return json({release:publicRelease(fresh),deploysAutomatically:false});
}

export async function controlRelease(request:Request,env:Env,id:string) {
  if(!requireRole(request,env,["master"])) return json({error:"Unauthorized"},401);
  const b=await request.json().catch(()=>({})) as Record<string,unknown>,status=String(b.status||"").trim();
  if(!STATUSES.includes(status as any) || status === "validated" || status === "superseded") return json({error:"Invalid manual release status"},400);
  const row=await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();if(!row)return json({error:"Release not found"},404);
  const stamp=now();
  await env.DB.prepare("UPDATE releases SET status=?,paused_at=?,withdrawn_at=?,updated_at=? WHERE id=?")
    .bind(status,status==="paused"?stamp:null,status==="withdrawn"?stamp:null,stamp,id).run();
  await audit(env,id,status,String(b.actorRef||"master"),{reason:b.reason||null});
  const fresh=await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();return json({release:publicRelease(fresh)});
}

export async function releaseArtifactDownload(request:Request,env:Env,id:string) {
  const row=await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if(!row || row.status!=="published" || !row.artifact_path || !env.RELEASES)return new Response("Not found",{status:404});
  const object=await env.RELEASES.get(row.artifact_path);if(!object)return new Response("Not found",{status:404});
  return new Response(object.body,{headers:{"content-type":row.artifact_content_type||object.httpMetadata?.contentType||"application/octet-stream",
    "cache-control":"private, max-age=300","etag":row.artifact_sha256||"","x-artifact-sha256":row.artifact_sha256||""}});
}
