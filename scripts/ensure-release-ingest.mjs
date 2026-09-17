import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/server.ts';
let source = readFileSync(path, 'utf8');
const marker = '    // ORBITFS_INTERNAL_RELEASE_INGEST_V1';
if (!source.includes(marker)) {
  const anchor = '    const deploymentMatch = path.match(/^\\/api\\/deployments(?:\\/([^/]+))?$/);';
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error('Server deployment route anchor not found');
  const block = [
    '    ' + marker,
    '    if (path === "/api/internal/releases/ingest" && req.method === "POST") {',
    '      if (!allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });',
    '      const input = await body(req);',
    '      const productId = String(input.product_id || "orbitfs_base").trim();',
    '      const component = productId || "orbitfs_base";',
    '      const version = String(input.version || "").trim();',
    '      const channel = String(input.channel || "stable").trim() || "stable";',
    '      const sourceRepo = String(input.source_repo || "").trim();',
    '      const sourceBranch = String(input.source_branch || "").trim();',
    '      const sourceSha = String(input.source_sha || "").trim();',
    '      if (!version) return json(res, 400, { error: "version is required" });',
    '      if (!/^[0-9a-f]{40}$/i.test(sourceSha)) return json(res, 400, { error: "source_sha must be the exact 40-character release commit SHA" });',
    '      if (!sourceRepo || !sourceBranch) return json(res, 400, { error: "source_repo and source_branch are required" });',
    '      const releaseId = `rel_${component}_${version.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;',
    '      const manifest = {',
    '        eventType: String(input.event_type || "orbitfs-release"),',
    '        productId,',
    '        product: String(input.product || productId),',
    '        releaseType: String(input.release_type || (component === "orbitfs_base" ? "base" : "update")),',
    '        sourceRepo,',
    '        sourceBranch,',
    '        sourceCommit: sourceSha,',
    '        sourceUrl: `https://github.com/${sourceRepo}/commit/${sourceSha}`,',
    '        artifactRepo: String(input.artifact_repo || sourceRepo),',
    '        artifactRunId: input.artifact_run_id ?? null,',
    '        artifactName: String(input.artifact_name || ""),',
    '        artifactUrl: String(input.artifact_url || ""),',
    '        checksum: String(input.checksum || ""),',
    '        vercelReady: input.vercel_ready === true,',
    '        supabaseReady: input.supabase_ready === true,',
    '        ingestedAt: new Date().toISOString(),',
    '      };',
    '      const result = await query<JsonObject>(',
    '        `insert into releases(id,component,version,channel,status,title,description,changelog,customer_notes,internal_notes,severity,required,rollout,schema_version,components,manifest,permissions,compatibility,source_commit)',
    '         values($1,$2,$3,$4,\'draft\',$5,$6,$7,\'\',\'\',\'normal\',false,\'internal\',\'1\',$8,$9,\'{}\',\'{}\',$10)',
    '        on conflict(component,channel,version) do update set',
    '          title=excluded.title, description=excluded.description, changelog=excluded.changelog, components=excluded.components, manifest=excluded.manifest, source_commit=excluded.source_commit, updated_at=now()',
    '        returning *`,',
    '        [',
    '          releaseId,',
    '          component,',
    '          version,',
    '          channel,',
    '          String(input.product || `OrbitFS ${component} ${version}`),',
    '          `Release ${version} from ${sourceRepo} / ${sourceBranch}`,',
    '          String(input.changelog || ""),',
    '          JSON.stringify([component]),',
    '          JSON.stringify(manifest),',
    '          sourceSha,',
    '        ],',
    '      );',
    '      const release = result.rows[0];',
    '      await audit("release", releaseId, "ingested", actorFrom(req), { sourceRepo, sourceBranch, sourceSha, version, channel, artifactName: manifest.artifactName, artifactRunId: manifest.artifactRunId });',
    '      return json(res, 200, { ok: true, release, source: { repo: sourceRepo, branch: sourceBranch, sha: sourceSha, shortSha: sourceSha.slice(0, 12) } });',
    '    }',
    ''
  ].join('\n');
  source = source.slice(0, at) + block + source.slice(at);
  writeFileSync(path, source);
}
