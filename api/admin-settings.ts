import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MASTER = process.env.MASTER_API_TOKEN || "";
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

const json = (res: ServerResponse, status: number, value: unknown) => { res.statusCode=status; res.setHeader("content-type","application/json; charset=utf-8"); res.setHeader("cache-control","no-store"); res.end(JSON.stringify(value)); };
const token = (req: IncomingMessage) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();

async function admin(req: IncomingMessage) {
  const t = token(req);
  if (!t || !SUPABASE_URL || !SERVICE) return false;
  if (MASTER && t === MASTER) return true;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE, authorization: `Bearer ${t}` } });
  if (!r.ok) return false;
  const u = await r.json() as any;
  return ADMIN_EMAILS.has(String(u.email || "").toLowerCase()) || u.app_metadata?.role === "admin";
}
async function sb(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE) throw new Error("Supabase configuration is missing");
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey:SERVICE, authorization:`Bearer ${SERVICE}`, "content-type":"application/json", ...(init.headers || {}) } });
}
async function readBody(req: IncomingMessage) { const chunks:Buffer[]=[]; for await (const c of req) chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)); return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{}; }

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode=204; return res.end(); }
  if (!(await admin(req))) return json(res, 401, { error:"Administrator authentication is required" });
  try {
    if (req.method === "GET") {
      let r = await sb("/rest/v1/master_license_settings?id=eq.primary&select=*");
      let rows = await r.json().catch(() => []);
      if (!r.ok) return json(res, r.status, { error:`Supabase settings query failed (${r.status})`, detail:rows });
      if (!Array.isArray(rows) || !rows[0]) {
        r = await sb("/rest/v1/master_license_settings", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({id:"primary",issuer:"orbitfs-license-master",audience:"orbitfs-runtime",entitlement_ttl_seconds:10800,grace_seconds:604800,api_mode:"online",allow_offline_grace:true,revision:1}) });
        rows = await r.json().catch(() => []);
        if (!r.ok) return json(res, r.status, { error:`Supabase settings initialization failed (${r.status})`, detail:rows });
      }
      return json(res,200,{ settings:Array.isArray(rows)?rows[0]:rows, database:true });
    }
    if (!["PATCH","POST"].includes(req.method || "")) return json(res,405,{error:"Method not allowed"});
    const input = await readBody(req);
    const mode = ["online","offline","maintenance"].includes(String(input.api_mode)) ? String(input.api_mode) : "online";
    const payload = { id:"primary", issuer:String(input.issuer || "orbitfs-license-master"), audience:String(input.audience || "orbitfs-runtime"), entitlement_ttl_seconds:Math.max(60,Math.floor(Number(input.entitlement_ttl_seconds || 10800))), grace_seconds:Math.max(0,Math.floor(Number(input.grace_seconds ?? 604800))), api_mode:mode, allow_offline_grace:Boolean(input.allow_offline_grace), revision:Math.max(1,Math.floor(Number(input.revision || 1))), updated_at:new Date().toISOString() };
    const r = await sb("/rest/v1/master_license_settings?on_conflict=id", { method:"POST", headers:{ Prefer:"resolution=merge-duplicates,return=representation" }, body:JSON.stringify(payload) });
    const data = await r.json().catch(() => []);
    if (!r.ok) return json(res,r.status,{error:`Supabase settings update failed (${r.status})`,detail:data});
    return json(res,200,{settings:Array.isArray(data)?data[0]:data,database:true});
  } catch (e) { return json(res,502,{error:e instanceof Error?e.message:"License settings operation failed"}); }
}
