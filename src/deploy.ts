import { json, now, type Env } from "./types";

export async function deployment(request: Request, env: Env) {
  if (request.headers.get("authorization") !== `Bearer ${env.DEPLOYER_API_TOKEN}`)
    return json({ error:"Unauthorized" }, 401);
  const b = await request.json().catch(() => ({})) as Record<string,unknown>;
  const action = String(b.action || "create");
  if (action === "create") {
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO deployment_jobs
      (id,licence_id,release_id,installation_id,action,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(id, String(b.licenceId || ""), String(b.releaseId || ""),
      String(b.installationId || ""), "deploy", "queued", now(), now()).run();
    return json({ id, status:"queued" }, 202);
  }
  const id = String(b.jobId || "");
  if (!id) return json({ error:"jobId is required" }, 400);
  if (action === "cancel") {
    await env.DB.prepare("UPDATE deployment_jobs SET status='cancelled',updated_at=? WHERE id=? AND status='queued'").bind(now(), id).run();
    return json({ id, status:"cancelled" });
  }
  if (action === "status") {
    const job = await env.DB.prepare("SELECT * FROM deployment_jobs WHERE id=? LIMIT 1").bind(id).first();
    return job ? json(job) : json({ error:"Job not found" }, 404);
  }
  return json({ error:"Unknown deployment action" }, 400);
}
