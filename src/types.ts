export interface Env {
  DB: D1Database;
  RELEASES?: R2Bucket;
  MASTER_API_TOKEN: string;
  BILLING_API_TOKEN: string;
  DEPLOYER_API_TOKEN: string;
  ENTITLEMENT_PRIVATE_KEY_B64: string;
  ENTITLEMENT_ISSUER: string;
  ENTITLEMENT_AUDIENCE: string;
  ENTITLEMENT_TTL_SECONDS: string;
  ENTITLEMENT_GRACE_SECONDS: string;
}

export const COMPONENTS = [
  "orbitfs_base",
  "orbitfs_mcp",
  "orbitfs_apex",
  "orbitfs_studio"
] as const;

export type Component = typeof COMPONENTS[number];

export const json = (body: unknown, status = 200, headers: Record<string,string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export const now = () => new Date().toISOString();
