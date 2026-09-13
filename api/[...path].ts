import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

const sendJson = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};

const siteUrl = String(process.env.SITE_URL || "").replace(/\/$/, "");
const apiBase = siteUrl ? `${siteUrl}/api` : "/api";

const apiIndex = (res: ServerResponse) => sendJson(res, 200, {
  ok: true,
  service: "OrbitFS License Master V2",
  api: apiBase,
  authority: "license-master",
  database: Boolean(process.env.DATABASE_URL),
  services: {
    billing: Boolean(process.env.BILLING_API_TOKEN),
    deployer: Boolean(process.env.DEPLOYER_API_TOKEN),
    github: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    signing: Boolean(process.env.LICENSE_ENTITLEMENT_PRIVATE_KEY_B64 || process.env.ENTITLEMENT_PRIVATE_KEY_B64),
  },
  endpoints: {
    products: `${apiBase}/products`,
    licenses: `${apiBase}/licenses`,
    licenseIssue: `${apiBase}/license/issue`,
    licenseValidate: `${apiBase}/license/validate`,
    licenseRevision: `${apiBase}/license/revision`,
    licensePublicKey: `${apiBase}/license/public-key`,
    releases: `${apiBase}/releases`,
    latestRelease: `${apiBase}/releases/latest`,
    installations: `${apiBase}/installations`,
    deployments: `${apiBase}/deployments`,
    executeDeployment: `${apiBase}/deployments/execute`,
    syncDeployments: `${apiBase}/deployments/sync`,
    billingHandshake: `${apiBase}/billing`,
    admin: `${apiBase}/admin`,
    adminMe: `${apiBase}/admin/me`,
  },
});

export default async function api(req: IncomingMessage, res: ServerResponse) {
  try {
    const rawPath = String(req.url || "/").split("?")[0];
    const pathname = rawPath === "/api" || rawPath === "/api/" ? "/api" : rawPath.startsWith("/api/") ? rawPath : `/api${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;
    if (pathname === "/api/admin" || pathname === "/api/admin/") {
      const html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");
      res.statusCode = 200;res.setHeader("content-type", "text/html; charset=utf-8");res.setHeader("cache-control", "no-store, max-age=0");return res.end(html);
    }
    if (pathname === "/api/admin-products-ui") {const { default: productsUi } = await import("./admin-products-ui.js");return productsUi(req, res);}
    if (pathname === "/api/admin-control-ui") {const { default: adminControlUi } = await import("./admin-control-ui.js");return adminControlUi(req, res);}
    if (pathname === "/api/admin-control-login" || pathname === "/api/auth/login") {const { default: adminControlLogin } = await import("./admin-control-login.js");return adminControlLogin(req, res);}
    if (pathname === "/api/admin-extended" || pathname === "/api/admin-extended/") { const { default: adminExtended } = await import("./admin-extended.js"); return adminExtended(req, res); }
    if (pathname === "/api/admin-settings") { const { default: adminSettings } = await import("./admin-settings.js"); return adminSettings(req, res); }
    if (pathname === "/api/release-capture") { const { default: releaseCapture } = await import("./release-capture.js"); return releaseCapture(req, res); }
    if (pathname === "/api/release-control") { const { default: releaseControl } = await import("./release-control.js"); return releaseControl(req, res); }
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    if (pathname === "/api") return apiIndex(res);
    const originalUrl = req.url;
    req.url = pathname + (String(originalUrl || "").includes("?") ? String(originalUrl).slice(String(originalUrl).indexOf("?")) : "");
    try {
      const { handler } = await import("../src/server.js");
      return await handler(req, res);
    } finally {
      req.url = originalUrl;
    }
  } catch (error) {
    const requestId = String(req.headers["x-request-id"] || randomUUID());
    console.error(JSON.stringify({requestId,phase:"module_initialization",error:error instanceof Error ? error.stack || error.message : String(error)}));
    res.statusCode = 500;res.setHeader("content-type", "application/json; charset=utf-8");res.setHeader("x-request-id", requestId);res.end(JSON.stringify({ error: "Master function initialization failed", requestId }));
  }
}
