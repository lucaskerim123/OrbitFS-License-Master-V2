import { json, now, type Env } from "./types";

export async function control(request: Request, env: Env, id: string) {
  if (request.headers.get("authorization") !== `Bearer ${env.MASTER_API_TOKEN}`)
    return json({ error:"Unauthorized" }, 401);
  const licence = await env.DB.prepare("SELECT id,status FROM licences WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!licence) return json({ error:"Licence not found" }, 404);
  const b = await request.json().catch(() => ({})) as Record<string,unknown>;
  const action = String(b.action || "");
  const stamp = now();
  if (!["activate","suspend","terminate","unblock","unlock"].includes(action))
    return json({ error:"Invalid action" }, 400);
  if (action === "suspend") await env.DB.prepare("UPDATE licences SET status='suspended',updated_at=? WHERE id=?").bind(stamp,id).run();
  if (action === "terminate") await env.DB.prepare("UPDATE licences SET status='terminated',updated_at=? WHERE id=?").bind(stamp,id).run();
  if (action === "activate" || action === "unblock") await env.DB.prepare("UPDATE licences SET status='active',updated_at=? WHERE id=?").bind(stamp,id).run();
  if (action === "unlock") await env.DB.prepare("UPDATE licence_components SET installation_id=NULL,locked_at=NULL WHERE licence_id=?").bind(id).run();
  await env.DB.prepare("INSERT INTO audit_log (id,entity_type,entity_id,action,actor_ref,detail,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),"licence",id,action,String(b.actorRef || "master"),b.reason ? JSON.stringify({reason:b.reason}) : null,stamp).run();
  return json({ ok:true, licenceId:id, action, status:action === "unlock" ? licence.status : action === "unblock" || action === "activate" ? "active" : action });
}
