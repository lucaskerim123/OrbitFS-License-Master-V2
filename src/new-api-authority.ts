import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, timingSafeEqual } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";

type JsonObject = Record<string, unknown>;

const databaseUrl = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
const db = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 5, ssl: { rejectUnauthorized: false } }) : null;
const MASTER = process.env.MASTER_API_TOKEN || "";
const BILLING = process.env.BILLING_API_TOKEN || "";
const DEPLOYER = process.env.DEPLOYER_API_TOKEN || "";
const PRIVATE_KEY = process.env.LICENSE_ENTITLEMENT_PRIVATE_KEY_B64 || process.env.ENTITLEMENT_PRIVATE_KEY_B64 || "";
const COMPONENTS = ["orbitfs_base", "orbitfs_mcp", "orbitfs_apex", "orbitfs_studio"] as const;
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

export const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization,x-orbitfs-order-ref,x-actor-ref",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "cache-control": "no-store",
};

export class AuthorityError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

export const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: cors });

export const bodyOf = async (req: Request): Promise<JsonObject> => {
  const value = await req.json().catch(() => ({}));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthorityError(400, "Request body must be a JSON object", "INVALID_BODY");
  return value as JsonObject;
};

const query = async <T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) => {
  if (!db) throw new AuthorityError(503, "Database is not configured", "DATABASE_UNAVAILABLE");
  return db.query<T>(sql, values);
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const newLicenseKey = () => {
  const value = randomUUID().replaceAll("-", "").toUpperCase();
  return `OFS-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`;
};
const privatePem = () => PRIVATE_KEY ? Buffer.from(PRIVATE_KEY, "base64").toString("utf8") : "";

const entitlement = (payload: JsonObject) => {
  const pem = privatePem();
  if (!pem) throw new AuthorityError(503, "Entitlement signing is not configured", "SIGNING_KEY_MISSING");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${header}.${claims}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), createPrivateKey(pem)).toString("base64url");
  return `${input}.${signature}`;
};

export const publicSigningPem = () => {
  const encoded = String(process.env.LICENSE_ENTITLEMENT_PUBLIC_KEY_B64 || "").trim();
  if (encoded) return Buffer.from(encoded, "base64").toString("utf8");
  const pem = privatePem();
  return pem ? createPublicKey(createPrivateKey(pem)).export({ type: "spki", format: "pem" }).toString() : "";
};

const sameSecret = (actual: string, expected: string) => {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const bearer = (req: Request) => {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
};

const allowedService = (req: Request, roles: ("master" | "billing" | "deployer")[]) => {
  const token = bearer(req);
  return roles.some((role) => sameSecret(token, role === "master" ? MASTER : role === "billing" ? BILLING : DEPLOYER));
};

export async function requireAdmin(req: Request) {
  const token = bearer(req);
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!token || !url || !key) throw new AuthorityError(503, "Administrator authentication is not configured", "ADMIN_AUTH_UNAVAILABLE");
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new AuthorityError(401, "Administrator authentication is required", "ADMIN_AUTH_REQUIRED");
  const user = await response.json() as JsonObject;
  const metadata = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata as JsonObject : {};
  const email = String(user.email || "").toLowerCase();
  if (!adminEmails.has(email) && metadata.role !== "admin") throw new AuthorityError(403, "Administrator access required", "ADMIN_FORBIDDEN");
  return user;
}

export async function health() {
  let database = false;
  if (db) {
    try { database = (await query("select 1")).rowCount === 1; } catch { database = false; }
  }
  let signingConfigured = false;
  try { signingConfigured = Boolean(publicSigningPem()); } catch { signingConfigured = false; }
  return {
    ok: true,
    service: "OrbitFS License Master",
    version: "2.0.0",
    authority: "license-master",
    database,
    signingConfigured,
    apiCredentials: { master: !!MASTER, billing: !!BILLING, deployer: !!DEPLOYER },
  };
}

export const revision = () => ({
  service: "OrbitFS License Master",
  version: "2.0.0",
  authority: "master",
  components: COMPONENTS,
});

export async function validateLicense(input: JsonObject) {
  const licenseKey = String(input.licenseKey || input.license_key || "").trim();
  const installationId = String(input.installationId || input.installation_id || "").trim();
  if (!licenseKey || !installationId || licenseKey.length > 200 || installationId.length > 200) {
    throw new AuthorityError(400, "licenseKey and installationId are required", "INVALID_REQUEST");
  }
  const binding = (await query<JsonObject>("select * from license_bindings where license_key_hash=$1 and archived_at is null limit 1", [hash(licenseKey)])).rows[0];
  if (!binding) throw new AuthorityError(404, "Licence not found", "LICENSE_NOT_FOUND");

  const expired = binding.expires_at && new Date(String(binding.expires_at)).getTime() <= Date.now();
  const state = expired ? "expired" : String(binding.status);
  const requested = Array.isArray(input.components) ? input.components.map(String).slice(0, COMPONENTS.length) : [...COMPONENTS];
  const result: JsonObject = {};
  const client = db ? await db.connect() : null;
  try {
    if (client) await client.query("begin");
    for (const requestedName of requested) {
      const component = requestedName === "orbitfs_panel" ? "orbitfs_base" : requestedName === "orbitfs_sorter" ? "orbitfs_apex" : requestedName;
      if (!COMPONENTS.includes(component as typeof COMPONENTS[number])) {
        result[requestedName] = { allowed: false, state: "blocked", lockedToThisInstallation: false, reason: "unknown_component" };
        continue;
      }
      const components = binding.components && typeof binding.components === "object" ? binding.components as JsonObject : {};
      const enabled = components[component] === true || (component === "orbitfs_base" && Object.keys(components).length === 0);
      let installation = (await (client ?? db)?.query(
        "select * from license_installations where binding_id=$1 and component_key=$2 and installation_id=$3 limit 1",
        [binding.id, component, installationId],
      ))?.rows[0] as JsonObject | undefined;
      if (state === "active" && enabled && input.activate === true && !installation) {
        if (client) await client.query("select pg_advisory_xact_lock(hashtext($1))", [String(binding.id)]);
        const count = Number((await (client ?? db)?.query(
          "select count(distinct installation_id)::int as count from license_installations where binding_id=$1 and status='active'",
          [binding.id],
        ))?.rows[0]?.count || 0);
        if (count >= Number(binding.max_installations || 1)) throw new AuthorityError(409, "Installation limit reached", "INSTALLATION_LIMIT");
        await (client ?? db)?.query(
          `insert into license_installations
            (id,binding_id,component_key,installation_id,device_name,platform,app_version,status,registered_at,last_seen_at,locked_at,metadata)
           values($1,$2,$3,$4,$5,$6,$7,'active',now(),now(),now(),$8)
           on conflict(binding_id,component_key,installation_id) do update
             set status='active',last_seen_at=now(),locked_at=coalesce(license_installations.locked_at,now()),device_name=excluded.device_name,
                 platform=excluded.platform,app_version=excluded.app_version,metadata=excluded.metadata`,
          [randomUUID(), binding.id, component, installationId, input.deviceName || null, input.platform || null, input.appVersion || null, input.metadata || {}],
        );
        installation = (await (client ?? db)?.query(
          "select * from license_installations where binding_id=$1 and component_key=$2 and installation_id=$3 limit 1",
          [binding.id, component, installationId],
        ))?.rows[0] as JsonObject;
      } else if (installation) {
        await (client ?? db)?.query("update license_installations set last_seen_at=now() where id=$1", [installation.id]);
      }
      const allowedComponent = state === "active" && enabled && !!installation && installation.status === "active";
      result[requestedName] = {
        allowed: allowedComponent,
        state: !enabled ? "blocked" : state !== "active" ? state : allowedComponent ? "locked" : "blocked",
        lockedToThisInstallation: !!installation,
        reason: !enabled ? "not_included" : state !== "active" ? state : allowedComponent ? null : "activation_required",
      };
    }
    if (client) await client.query("commit");
  } catch (error) {
    if (client) await client.query("rollback");
    throw error;
  } finally {
    client?.release();
  }

  const settings = (await query<JsonObject>("select * from master_license_settings where id='primary'"))?.rows[0] || {};
  const iat = Math.floor(Date.now() / 1000);
  const ttl = Number(settings.entitlement_ttl_seconds || 10800);
  const grace = Number(settings.grace_seconds || 604800);
  const valid = state === "active" && Object.values(result).some((value) => (value as JsonObject).allowed === true);
  await query(
    "insert into license_validation_log(binding_id,license_id,installation_id,result,reason) values($1,$2,$3,$4,$5)",
    [binding.id, binding.id, installationId, valid ? "allowed" : "denied", valid ? null : state === "active" ? "activation_required" : state],
  );
  return {
    valid,
    reason: valid ? null : state === "active" ? "activation_required" : state,
    components: result,
    entitlement: entitlement({
      iss: String(settings.issuer || "orbitfs-license-master"),
      aud: String(settings.audience || "orbitfs-runtime"),
      iat,
      exp: iat + ttl,
      graceUntil: iat + ttl + grace,
      valid,
      reason: valid ? null : state,
      licenceId: binding.id,
      installationId,
      components: result,
    }),
  };
}

export async function issueLicense(req: Request, input: JsonObject) {
  if (!allowedService(req, ["billing", "master"])) throw new AuthorityError(401, "Unauthorized", "UNAUTHORIZED");
  const orderRef = String(input.orderRef || req.headers.get("x-orbitfs-order-ref") || "").trim();
  if (!orderRef || orderRef.length > 200) throw new AuthorityError(400, "orderRef is required", "INVALID_REQUEST");

  const client = await db?.connect();
  if (!client) throw new AuthorityError(503, "Database is not configured", "DATABASE_UNAVAILABLE");
  let created = false;
  try {
    await client.query("begin");
    const existing = (await client.query("select * from license_bindings where order_ref=$1 and archived_at is null for update", [orderRef])).rows[0] as JsonObject | undefined;
    let binding: JsonObject;
    let licenseKey: string | undefined;
    if (existing) {
      binding = existing;
      licenseKey = (await client.query("select license_key from license_key_delivery where binding_id=$1 order by created_at desc limit 1", [existing.id])).rows[0]?.license_key;
    } else {
      const maxInput = Number(input.maxInstallations ?? 1);
      const maxInstallations = Number.isFinite(maxInput) ? Math.max(1, Math.min(100, Math.floor(maxInput))) : 1;
      const components = input.components && typeof input.components === "object" && !Array.isArray(input.components) ? input.components : {};
      licenseKey = newLicenseKey();
      binding = (await client.query(
        `insert into license_bindings
          (id,customer_ref,order_ref,product_code,status,desired_state,remote_state,expires_at,max_installations,components,metadata,license_key_hash,license_key_last4,notes)
         values($1,$2,$3,$4,'active','active','active',$5,$6,$7,$8,$9,$10,$11)
         on conflict (order_ref) where archived_at is null do update set updated_at=license_bindings.updated_at
         returning *`,
        [randomUUID(), String(input.customerRef || ""), orderRef, String(input.productCode || "orbitfs_base"), input.expiresAt || null, maxInstallations, components, input.metadata || {}, hash(licenseKey), licenseKey.slice(-4), input.notes || null],
      )).rows[0] as JsonObject;
      if (binding.license_key_hash === hash(licenseKey)) {
        created = true;
        await client.query("insert into license_key_delivery(binding_id,customer_ref,license_key) values($1,$2,$3)", [binding.id, String(input.customerRef || ""), licenseKey]);
        await client.query(
          `insert into license_fulfillments(order_ref,customer_ref,product_code,state,binding_id,license_id,fulfilled_at,metadata)
           values($1,$2,$3,'fulfilled',$4,$4,now(),$5) on conflict(order_ref) do nothing`,
          [orderRef, String(input.customerRef || ""), String(input.productCode || "orbitfs_base"), binding.id, { components }],
        );
      }
    }
    await client.query("commit");
    return { licence: binding, ...(licenseKey ? { licenceKey: licenseKey } : {}), status: binding.status, idempotent: !created };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
