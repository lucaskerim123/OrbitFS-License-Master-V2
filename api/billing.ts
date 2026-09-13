import type { IncomingMessage, ServerResponse } from "node:http";

const BILLING_SITE_URL = String(process.env.BILLING_SITE_URL || "").replace(/\/$/, "");
const BILLING_API_TOKEN = process.env.BILLING_API_TOKEN || "";

function json(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}

function bearer(req: IncomingMessage) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

export default async function billing(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const token = bearer(req);
  if (!BILLING_API_TOKEN || token !== BILLING_API_TOKEN) return json(res, 401, { error: "Billing Store authentication is required" });

  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  return json(res, 200, {
    ok: true,
    authority: "license-master",
    service: "OrbitFS License Master V2",
    billingSiteUrl: BILLING_SITE_URL || null,
    apiBase: "/api",
    capabilities: {
      products: true,
      licenseIssue: true,
      licenseValidate: true,
      licenseRevision: true,
      licenses: true,
      installations: true,
      releases: true,
      deployments: true,
      deploymentSync: true,
    },
    contract: {
      products: "/api/products",
      licenses: "/api/licenses",
      issue: "/api/license/issue",
      validate: "/api/license/validate",
      revision: "/api/license/revision",
      publicKey: "/api/license/public-key",
      installations: "/api/installations",
      releases: "/api/releases",
      deployments: "/api/deployments",
      deploymentSync: "/api/deployments/sync",
    },
  });
}
