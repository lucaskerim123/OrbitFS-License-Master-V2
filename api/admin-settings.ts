import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool } from "pg";

const DATABASE_URL = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
const db = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } }) : null;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const MASTER = process.env.MASTER_API_TOKEN || "";
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

type Settings = {
  id:string; enabled:boolean; issuer:string; audience:string; entitlement_ttl_seconds:number;
  grace_seconds:number; api_mode:string; allow_offline_grace:boolean; revision:number; updated_at:string;
};
const json=(res:ServerResponse,status:number,value:unknown)=>{res.statusCode=status;res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.end(JSON.stringify(value));};
const token=(req:IncomingMessage)=>String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();

async function admin(req:IncomingMessage){
  const t=token(req); if(!t)return false; if(MASTER&&t===MASTER)return true;
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY)return false;
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON_KEY,authorization:`Bearer ${t}`}});
  if(!r.ok)return false;
  const u=await r.json() as {email?:string;app_metadata?:{role?:string}};
  return ADMIN_EMAILS.has(String(u.email||"").trim().toLowerCase())||u.app_metadata?.role==="admin";
}

async function ensureSettingsTable(){
  if(!db)throw new Error("Database is not configured");
  await db.query(`create table if not exists master_license_settings (id text primary key, enabled boolean not null default true, issuer text not null default 'orbitfs-license-master', audience text not null default 'orbitfs-runtime', entitlement_ttl_seconds integer not null default 10800, grace_seconds integer not null default 604800, revision bigint not null default 1, updated_at timestamptz not null default now()); alter table master_license_settings add column if not exists enabled boolean not null default true; alter table master_license_settings add column if not exists api_mode text not null default 'online'; alter table master_license_settings add column if not exists allow_offline_grace boolean not null default true; insert into master_license_settings(id) values ('primary') on conflict (id) do nothing;`);
}

async function getSettings():Promise<Settings>{
  await ensureSettingsTable();
  const row=(await db!.query<Settings>("select id,enabled,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at from master_license_settings where id='primary'")).rows[0];
  if(!row)throw new Error("License Master settings row is unavailable");
  return row;
}

async function readBody(req:IncomingMessage){
  const chunks:Buffer[]=[]; for await(const c of req)chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)); if(!chunks.length)return{} as Record<string,unknown>;
  let value:unknown; try{value=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new Error("Request body must be valid JSON");}
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Request body must be an object"); return value as Record<string,unknown>;
}

async function updateSettings(input:Record<string,unknown>):Promise<Settings>{
  const current=await getSettings();
  const requestedMode=String(input.api_mode??input.mode??current.api_mode??"online").toLowerCase();
  const mode=requestedMode==="active"?"online":requestedMode;
  if(!["online","offline","maintenance"].includes(mode))throw new Error("api_mode must be online, offline, or maintenance");
  const enabled=input.enabled===undefined?current.enabled!==false:Boolean(input.enabled);
  const ttl=Number(input.entitlement_ttl_seconds??current.entitlement_ttl_seconds??10800); const grace=Number(input.grace_seconds??current.grace_seconds??604800);
  if(!Number.isFinite(ttl)||!Number.isFinite(grace))throw new Error("TTL and grace period must be valid numbers");
  const issuer=String(input.issuer??current.issuer??"orbitfs-license-master").trim(); const audience=String(input.audience??current.audience??"orbitfs-runtime").trim();
  if(!issuer||!audience)throw new Error("Issuer and audience are required");
  const revision=Math.max(1,Math.floor(Number(input.revision??Number(current.revision||0)+1)));
  const allowOfflineGrace=input.allow_offline_grace===undefined?current.allow_offline_grace!==false:Boolean(input.allow_offline_grace);
  const row=(await db!.query<Settings>(`update master_license_settings set enabled=$1,issuer=$2,audience=$3,entitlement_ttl_seconds=$4,grace_seconds=$5,api_mode=$6,allow_offline_grace=$7,revision=$8,updated_at=now() where id='primary' returning id,enabled,issuer,audience,entitlement_ttl_seconds,grace_seconds,api_mode,allow_offline_grace,revision,updated_at`,[enabled,issuer,audience,Math.max(60,Math.floor(ttl)),Math.max(0,Math.floor(grace)),mode,allowOfflineGrace,revision])).rows[0];
  if(!row)throw new Error("License Master settings update returned no row"); return row;
}

export default async function handler(req:IncomingMessage,res:ServerResponse){
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  try{
    if(!(await admin(req)))return json(res,401,{error:"Administrator authentication is required"});
    if(req.method==="GET")return json(res,200,{ok:true,settings:await getSettings(),database:true,settings_found:true});
    if(req.method!=="PATCH"&&req.method!=="POST")return json(res,405,{error:"Method not allowed"});
    return json(res,200,{ok:true,settings:await updateSettings(await readBody(req)),database:true,settings_found:true});
  }catch(e){return json(res,503,{ok:false,database:false,settings_found:false,error:e instanceof Error?e.message:"License Master settings operation failed"});}
}
