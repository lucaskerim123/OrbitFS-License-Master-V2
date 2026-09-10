import { json, now, type Env } from "./types";

export async function releases(request: Request, env: Env) {
  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM releases ORDER BY created_at DESC").all();
    return json({ releases: rows.results || [] });
  }
  if (request.method !== "POST") return json({ error:"Method not allowed" }, 405);
  if (request.headers.get("authorization") !== `Bearer ${env.MASTER_API_TOKEN}`)
    return json({ error:"Unauthorized" }, 401);
  const b = await request.json().catch(() => ({})) as Record<string,unknown>;
  const id = crypto.randomUUID(), stamp = now();
  const version = String(b.version || "").trim();
  if (!version) return json({ error:"version is required" }, 400);
  await env.DB.prepare(`INSERT INTO releases
    (id,component,version,channel,status,changelog,manifest_json,permissions_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, String(b.component || "orbitfs"), version,
    String(b.channel || "stable"), "draft", String(b.changelog || ""),
    JSON.stringify(b.manifest || {}), JSON.stringify(b.permissions || {}), stamp, stamp).run();
  return json({ id, status:"draft" }, 201);
}

export async function publishRelease(request: Request, env: Env, id: string) {
  if (request.headers.get("authorization") !== `Bearer ${env.MASTER_API_TOKEN}`)
    return json({ error:"Unauthorized" }, 401);
  const release = await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!release) return json({ error:"Release not found" }, 404);
  await env.DB.prepare("UPDATE releases SET status='published',published_at=?,updated_at=? WHERE id=?")
    .bind(now(), now(), id).run();
  return json({ id, status:"published", customerAvailability:"admin_controlled" });
}
