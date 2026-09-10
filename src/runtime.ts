import { COMPONENTS, json, now, type Env } from "./types";
import { sha256, signEntitlement } from "./crypto";

export async function validate(request: Request, env: Env) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const key = String(b.licenseKey || "").trim(), installationId = String(b.installationId || "").trim();
  if (!key || !installationId) return json({ error: "licenseKey and installationId are required" }, 400);
  const row = await env.DB.prepare("SELECT * FROM licences WHERE key_hash=? LIMIT 1").bind(await sha256(key)).first<any>();
  if (!row) return json({ error: "Licence not found", code: "LICENSE_NOT_FOUND" }, 404);
  const components = await env.DB.prepare("SELECT * FROM licence_components WHERE licence_id=?").bind(row.id).all<any>();
  const enabled = (components.results || []).filter((c: any) => Number(c.enabled) === 1);
  const expired = !!row.expires_at && Date.parse(row.expires_at) <= Date.now(), state = expired ? "expired" : row.status;
  const existing = await env.DB.prepare("SELECT * FROM installations WHERE licence_id=? AND installation_ref=? LIMIT 1").bind(row.id, installationId).first<any>();
  if (b.activate === true && state === "active" && !existing) {
    const bound = await env.DB.prepare("SELECT COUNT(DISTINCT installation_ref) AS count FROM installations WHERE licence_id=? AND status='active'").bind(row.id).first<any>();
    if (Number(bound?.count || 0) >= Number(row.max_installations || 1)) return json({ error:"Installation limit reached", code:"INSTALLATION_LIMIT" },409);
    const stamp = now();
    for (const c of enabled) {
      if (!c.installation_id) await env.DB.prepare("UPDATE licence_components SET installation_id=?,locked_at=? WHERE licence_id=? AND component=?")
        .bind(installationId,stamp,row.id,c.component).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO installations
        (id,licence_id,component,installation_ref,hostname,platform,version,metadata_json,last_seen,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),row.id,c.component,installationId,String(b.hostname||""),String(b.platform||""),
        String(b.version||""),JSON.stringify(b.metadata||{}),stamp,"active",stamp,stamp).run();
    }
  }
  const fresh = await env.DB.prepare("SELECT * FROM licence_components WHERE licence_id=?").bind(row.id).all<any>();
  const result: Record<string, unknown> = {};
  for (const component of COMPONENTS) {
    const c=(fresh.results||[]).find((x:any)=>x.component===component), isEnabled=Number(c?.enabled)===1, locked=c?.installation_id;
    result[component]=!isEnabled?{allowed:false,state:"blocked",reason:"not_included"}:state!=="active"?
      {allowed:false,state,reason:state}:!locked?{allowed:true,state:"active",reason:"activation_required"}:
      {allowed:locked===installationId,state:locked===installationId?"locked":"blocked",lockedToThisInstallation:locked===installationId,
       reason:locked===installationId?null:"locked_to_another_installation"};
  }
  const iat=Math.floor(Date.now()/1000),ttl=Number(env.ENTITLEMENT_TTL_SECONDS||10800);
  const payload={iss:env.ENTITLEMENT_ISSUER,aud:env.ENTITLEMENT_AUDIENCE,iat,exp:iat+ttl,graceUntil:iat+ttl+Number(env.ENTITLEMENT_GRACE_SECONDS||604800),
    valid:state==="active",reason:state==="active"?null:state,licenceId:row.id,installationId,components:result};
  return json({entitlement:await signEntitlement(payload,env),status:state});
}

export async function heartbeat(request:Request,env:Env,id:string){
  const b=await request.json().catch(()=>({})) as Record<string,unknown>,installationId=String(b.installationId||"").trim();
  if(!installationId)return json({error:"installationId is required"},400);
  const stamp=now();
  const result=await env.DB.prepare(`UPDATE installations SET last_seen=?,hostname=?,platform=?,version=?,metadata_json=?,updated_at=?
    WHERE licence_id=? AND installation_ref=? AND status='active'`).bind(stamp,String(b.hostname||""),String(b.platform||""),String(b.version||""),JSON.stringify(b.metadata||{}),stamp,id,installationId).run();
  return result.meta.changes?json({ok:true,lastSeen:stamp}):json({error:"Installation not found"},404);
}
