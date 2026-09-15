import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { IncomingMessage, ServerResponse } from "node:http";

const normalizeDatabaseUrl = (value: string) => {
  const raw = String(value || "").replace(/[?&]sslmode=[^&]+/i, "");
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const match = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (!match) return raw;
    const projectRef = match[1];
    const region = String(process.env.SUPABASE_DB_REGION || "us-west-2").trim();
    const poolerHost = String(process.env.SUPABASE_POOLER_HOST || `aws-0-${region}.pooler.supabase.com`).trim();
    url.hostname = poolerHost;
    url.port = "6543";
    if (url.username === "postgres") url.username = `postgres.${projectRef}`;
    return url.toString();
  } catch {
    return raw;
  }
};

const dbUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || "");
const db = dbUrl
  ? new Pool({
      connectionString: dbUrl,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      statement_timeout: 8000,
      ssl: { rejectUnauthorized: false },
    })
  : null;

const MASTER = process.env.MASTER_API_TOKEN || "";
const BILLING = process.env.BILLING_API_TOKEN || "";
const DEPLOYER = process.env.DEPLOYER_API_TOKEN || "";

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};

const bearer = (req: IncomingMessage) => {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
};

const role = (req: IncomingMessage) => {
  const token = bearer(req);
  if (token && token === MASTER) return "master";
  if (token && token === BILLING) return "billing";
  if (token && token === DEPLOYER) return "deployer";
  return null;
};

const body = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk) => {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(bytes);
    });
    req.on("end", () => {
      try {
        const value = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request body must be a JSON object");
        resolve(value as Record<string, unknown>);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Request body must be valid JSON"));
      }
    });
    req.on("error", reject);
  });

export default async function releaseCapture(req: IncomingMessage, res: ServerResponse) {
  try {
    const currentRole = role(req);
    if (!currentRole || !["master", "billing"].includes(currentRole)) return json(res, 401, { error: "Unauthorized" });
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    if (!db) return json(res, 503, { error: "Database is not configured" });

    const input = await body(req);
    const kind = String(input.kind || "update").toLowerCase() === "base" ? "base" : "update";
    const component = kind === "base" ? "orbitfs_base" : "orbitfs_mcp";
    const defaultRepo = kind === "base" ? "lucaskerim123/V1-vercel-base" : "lucaskerim123/V1-vercel-engine";
    const defaultBranch = kind === "base" ? "base-release" : "release-updates";
    const repo = String(input.sourceRepo || defaultRepo).trim() || defaultRepo;
    const branch = String(input.sourceBranch || defaultBranch).trim() || defaultBranch;
    const sourceCommit = String(input.sourceCommit || "").trim();

    if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
      return json(res, 400, { error: "sourceCommit must be the exact 40-character release commit SHA" });
    }

    const version = String(input.version || sourceCommit.slice(0, 12)).trim();
    if (!version) return json(res, 400, { error: "version is required" });

    const channel = kind;
    const id = `rel_${component}_${version.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
    const manifest = {
      sourceRepo: repo,
      sourceBranch: branch,
      sourceCommit,
      sourceUrl: `https://github.com/${repo}/commit/${sourceCommit}`,
      sourceMessage: String(input.sourceMessage || "Captured from manual Base release workflow"),
      sourceDate: input.sourceDate || null,
      captureKind: kind,
      packageFormat: kind === "base" ? "orbitfs-panel-release-v1" : "orbitfs-engine-release-v1",
    };

    const result = await db.query(
      `insert into releases(
        id,component,version,channel,status,title,description,changelog,customer_notes,internal_notes,
        severity,required,rollout,schema_version,components,manifest,permissions,compatibility,source_commit
      ) values(
        $1,$2,$3,$4,'draft',$5,$6,$7,'','',
        'normal',false,'internal','1',$8,$9,'{}','{}',$10
      )
      on conflict(component,channel,version) do update set
        source_commit=excluded.source_commit,
        manifest=excluded.manifest,
        updated_at=now()
      returning *`,
      [
        id,
        component,
        version,
        channel,
        String(input.title || `${component} ${version}`),
        String(input.description || `Captured from ${repo} / ${branch}`),
        String(input.changelog || String(input.sourceMessage || "Manual Base release capture")),
        JSON.stringify(kind === "base" ? ["orbitfs_base"] : ["orbitfs_mcp"]),
        JSON.stringify(manifest),
        sourceCommit,
      ],
    );

    return json(res, 200, {
      ok: true,
      release: result.rows[0],
      source: {
        repo,
        branch,
        sha: sourceCommit,
        shortSha: sourceCommit.slice(0, 12),
        url: manifest.sourceUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(res, 500, { error: message });
  }
}
