from pathlib import Path
p = Path('src/server.ts')
s = p.read_text()
needle = 'async function deployments(req: IncomingMessage, res: ServerResponse, id?: string) {'
insert = '''async function products(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req, ["master", "billing", "deployer"])) return json(res, 401, { error: "Unauthorized" });
  return json(res, 200, { products: COMPONENTS.map((code) => ({ code, type: "component", active: true })) });
}

async function installations(req: IncomingMessage, res: ServerResponse, id?: string) {
  if (!allowed(req, ["master", "billing", "deployer"])) return json(res, 401, { error: "Unauthorized" });
  if (req.method === "GET") {
    if (id) {
      const row = (await query<JsonObject>("select * from orbitfs_installations where id=$1", [id])).rows[0];
      return row ? json(res, 200, { installation: row }) : json(res, 404, { error: "Installation not found" });
    }
    return json(res, 200, { installations: (await query<JsonObject>("select * from orbitfs_installations order by updated_at desc limit 500")).rows });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const input = await body(req);
  const installationId = String(input.installationId || input.id || "").trim();
  if (!installationId || installationId.length > 200) return json(res, 400, { error: "installationId is required" });
  const row = (await query<JsonObject>(`insert into orbitfs_installations
    (id,user_ref,binding_id,hostname,platform,version,vercel_team_id,vercel_project_id,vercel_project_name,metadata,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    on conflict(id) do update set user_ref=excluded.user_ref,binding_id=excluded.binding_id,hostname=excluded.hostname,
    platform=excluded.platform,version=excluded.version,vercel_team_id=excluded.vercel_team_id,
    vercel_project_id=excluded.vercel_project_id,vercel_project_name=excluded.vercel_project_name,
    metadata=excluded.metadata,updated_at=now() returning *`,
    [installationId,input.userRef||null,input.bindingId||null,input.hostname||null,input.platform||null,input.version||null,
     input.vercelTeamId||null,input.vercelProjectId||null,input.vercelProjectName||null,input.metadata||{}])).rows[0];
  await audit("installation", installationId, "registered", actorFrom(req), { bindingId: input.bindingId || null });
  return json(res, 200, { installation: row });
}

async function settings(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const row = (await query<JsonObject>("select * from master_license_settings where id='primary'")).rows[0] || {};
  return json(res, 200, { settings: row });
}

'''
if needle not in s: raise SystemExit('function insertion point not found')
s = s.replace(needle, insert + needle, 1)
needle2 = '    if (path === "/api/license/revision") return json(res, 200, { service: "OrbitFS License Master", version: "2.0.0", authority: "master", components: COMPONENTS });\n'
routes = '''    if (path === "/api/products" && req.method === "GET") return products(req, res);
    if (path === "/api/settings" && req.method === "GET") return settings(req, res);
    const installationMatch = path.match(/^\\/api\\/v1\\/installations(?:\\/([^/]+))?$/);
    if (installationMatch) return installations(req, res, installationMatch[1] ? decodeURIComponent(installationMatch[1]) : undefined);
'''
if needle2 not in s: raise SystemExit('route insertion point not found')
s = s.replace(needle2, needle2 + routes, 1)
p.write_text(s)
print('patched')
