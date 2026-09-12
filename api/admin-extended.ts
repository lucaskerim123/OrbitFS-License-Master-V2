import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const MASTER = process.env.MASTER_API_TOKEN || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

async function isAdmin(req: IncomingMessage) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const user = await response.json() as Record<string, any>;
  const metadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return adminEmails.has(String(user.email || "").toLowerCase()) || metadata.role === "admin";
}

async function githubSource(repo: string, branch: string) {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured for private release source access");
  const response = await fetch(`https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${GITHUB_TOKEN}`, "x-github-api-version": "2022-11-28", "user-agent": "OrbitFS-License-Master-V2" },
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && typeof data === "object" ? String(data.message || "GitHub source lookup failed") : "GitHub source lookup failed");
  const commit = Array.isArray(data) ? data[0] : null;
  if (!commit?.sha) throw new Error(`No commits found for ${repo} / ${branch}`);
  return { repo, branch, sha: String(commit.sha), shortSha: String(commit.sha).slice(0,12), message: String(commit.commit?.message || "").split("\n")[0] || "No commit message", date: commit.commit?.author?.date || commit.commit?.committer?.date || null, url: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}` };
}

export default async function adminExtended(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (!(await isAdmin(req))) { res.statusCode = 401; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ error: "Administrator authentication is required" })); }
  if (!MASTER) { res.statusCode = 503; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ error: "MASTER_API_TOKEN is not configured" })); }

  const url = new URL(req.url || "/", "http://localhost");
  const action = url.searchParams.get("action") || "";
  const id = url.searchParams.get("id") || "";
  if (action === "releaseSource") {
    try {
      const requestedKind = String(req.headers["x-release-kind"] || url.searchParams.get("kind") || "update").toLowerCase();
      const kind = requestedKind === "base" ? "base" : "update";
      const source = kind === "base" ? await githubSource("lucaskerim123/V1-vercel-base", "release-updates") : await githubSource("lucaskerim123/V1-vercel-engine", "release-updates");
      res.statusCode = 200; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store");
      return res.end(JSON.stringify({ source }));
    } catch (error) {
      res.statusCode = 502; res.setHeader("content-type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to read release source" }));
    }
  }

  const map: Record<string,string> = {
    releases: "/api/v1/releases", releaseCreate: "/api/v1/releases", releasePublish: `/api/v1/releases/${encodeURIComponent(id)}/publish`, releaseValidate: `/api/v1/releases/${encodeURIComponent(id)}/validate`, releasePause: `/api/v1/releases/${encodeURIComponent(id)}/pause`, releaseWithdraw: `/api/v1/releases/${encodeURIComponent(id)}/withdraw`, deployments: "/api/v1/deployments", installations: "/api/v1/installations", products: "/api/v1/products", settings: "/api/v1/settings", licenseIssue: "/api/v1/license/issue", executeDeployment: "/api/v1/deployments/execute", syncDeployment: "/api/v1/deployments/sync",
  };
  const target = map[action];
  if (!target) { res.statusCode = 400; res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ error: "Unknown admin action" })); }
  const oldUrl = req.url; const oldAuth = req.headers.authorization; req.url = target; req.headers.authorization = `Bearer ${MASTER}`;
  try { const { handler } = await import("../src/server.js"); return handler(req, res); }
  finally { req.url = oldUrl; if (oldAuth === undefined) delete req.headers.authorization; else req.headers.authorization = oldAuth; }
}
