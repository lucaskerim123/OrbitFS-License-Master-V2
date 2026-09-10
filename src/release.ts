import { json, now, type Env, COMPONENTS } from "./types";

function auth(request: Request, token: string) {
  return request.headers.get("authorization") === `Bearer ${token}`;
}

function validVersion(value: unknown) {
  return /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(String(value || ""));
}

function publicRelease(row: any) {
  return {
    id: row.id, component: row.component, version: row.version,
    channel: row.channel, status: row.status, changelog: row.changelog,
    manifest: JSON.parse(row.manifest_json || "{}"),
    permissions: JSON.parse(row.permissions_json || "{}"),
    publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at,
    artifact: row.artifact_path ? { path: row.artifact_path, sha256: row.artifact_sha256, size: row.artifact_size } : null
  };
}

export async function releases(request: Request, env: Env) {
  if (request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM releases ORDER BY created_at DESC").all<any>();
    return json({ releases: (rows.results || []).map(publicRelease) });
  }
  if (!auth(request, env.MASTER_API_TOKEN)) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const version = String(b.version || "").trim();
  const component = String(b.component || "orbitfs_base").trim();
  if (!validVersion(version)) return json({ error: "version is required or invalid" }, 400);
  if (!(COMPONENTS as readonly string[]).includes(component)) return json({ error: "Invalid component" }, 400);
  const existing = await env.DB.prepare("SELECT * FROM releases WHERE component=? AND version=? LIMIT 1").bind(component, version).first<any>();
  if (existing) return json({ release: publicRelease(existing), idempotent: true });
  const id = crypto.randomUUID(), stamp = now();
  await env.DB.prepare(`INSERT INTO releases
    (id,component,version,channel,status,changelog,manifest_json,permissions_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, component, version, String(b.channel || "stable"), "draft",
    String(b.changelog || ""), JSON.stringify(b.manifest || {}), JSON.stringify(b.permissions || {}), stamp, stamp).run();
  const row = await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  return json({ release: publicRelease(row) }, 201);
}

export async function artifact(request: Request, env: Env, id: string) {
  if (!auth(request, env.MASTER_API_TOKEN)) return json({ error: "Unauthorized" }, 401);
  if (!env.RELEASES) return json({ error: "Release artifact storage is not configured" }, 503);
  const row = await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!row) return json({ error: "Release not found" }, 404);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 50 * 1024 * 1024) return json({ error: "Release artifact size is invalid" }, 400);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
  const path = `releases/${row.component}/${row.version}/artifact.bin`;
  await env.RELEASES.put(path, bytes, { httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" } });
  await env.DB.prepare("UPDATE releases SET artifact_path=?,artifact_sha256=?,artifact_size=?,updated_at=? WHERE id=?")
    .bind(path, sha256, bytes.byteLength, now(), id).run();
  const fresh = await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  return json({ release: publicRelease(fresh) });
}

export async function publishRelease(request: Request, env: Env, id: string) {
  if (!auth(request, env.MASTER_API_TOKEN)) return json({ error: "Unauthorized" }, 401);
  const row = await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!row) return json({ error: "Release not found" }, 404);
  if (!row.artifact_path) return json({ error: "Release artifact must be uploaded before publishing" }, 409);
  const stamp = now();
  await env.DB.prepare("UPDATE releases SET status='published',published_at=COALESCE(published_at,?),updated_at=? WHERE id=?")
    .bind(stamp, stamp, id).run();
  const fresh = await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  return json({ release: publicRelease(fresh), customerAvailability: "admin_controlled" });
}

export async function releaseArtifactDownload(request: Request, env: Env, id: string) {
  const row = await env.DB.prepare("SELECT * FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!row || row.status !== "published" || !row.artifact_path || !env.RELEASES) return new Response("Not found", { status: 404 });
  const object = await env.RELEASES.get(row.artifact_path);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=300", "etag": row.artifact_sha256 || "" } });
}

export async function controlRelease(request: Request, env: Env, id: string) {
  if (!auth(request, env.MASTER_API_TOKEN)) return json({ error: "Unauthorized" }, 401);
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const status = String(b.status || "").trim();
  if (!["paused", "withdrawn", "published", "draft"].includes(status)) return json({ error: "Invalid release status" }, 400);
  const row = await env.DB.prepare("SELECT id FROM releases WHERE id=? LIMIT 1").bind(id).first<any>();
  if (!row) return json({ error: "Release not found" }, 404);
  await env.DB.prepare("UPDATE releases SET status=?,updated_at=? WHERE id=?").bind(status, now(), id).run();
  const fresh = await env.DB.prepare("SELECT * FROM releases WHERE id=?").bind(id).first<any>();
  return json({ release: publicRelease(fresh) });
}
