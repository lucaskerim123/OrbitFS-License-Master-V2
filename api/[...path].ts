import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthorityError, bodyOf, health, issueLicense, publicSigningPem, requireAdmin, revision, validateLicense } from "../src/new-api-authority.js";
import { adminLicenseControl, licenseSettings, masterStatus, runtimeClients } from "../src/new-api-admin.js";

const sendJson = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};

const sendText = (res: ServerResponse, status: number, value: string, contentType = "text/plain; charset=utf-8") => {
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", "no-store");
  res.end(value);
};

const siteUrl = String(process.env.SITE_URL || "https://incendiarynetworks.cc").replace(/\/$/, "");
const apiBase = `${siteUrl}/api`;

const requestFromNode = (req: IncomingMessage) => new Request(`${siteUrl}${req.url || "/"}`, {
  method: req.method,
  headers: new Headers(req.headers as Record<string, string>),
  body: ["GET", "HEAD"].includes(String(req.method)) ? undefined : req,
  duplex: "half",
} as RequestInit);

const requestWithMasterAuthority = (input: Record<string, unknown>) => new Request(`${siteUrl}/api/license/issue`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.MASTER_API_TOKEN || ""}`,
  },
  body: JSON.stringify(input),
});

const apiIndex = (res: ServerResponse) => sendJson(res, 200, {
  ok: true,
  service: "OrbitFS License Master V2",
  api: apiBase,
  authority: "license-master",
  endpoints: {
    health: `${apiBase}/license/v1/health`,
    revision: `${apiBase}/license/v1/revision`,
    publicKey: `${apiBase}/license/v1/public-key`,
    register: `${apiBase}/license/v1/register`,
    activate: `${apiBase}/license/v1/activate`,
    validate: `${apiBase}/license/v1/validate`,
    issue: `${apiBase}/license/issue`,
  },
});

const licenseRoute = async (req: IncomingMessage, res: ServerResponse, pathname: string) => {
  if (pathname.endsWith("/health") && req.method === "GET") return sendJson(res, 200, await health());
  if (pathname.endsWith("/revision") && req.method === "GET") return sendJson(res, 200, revision());
  if (pathname.endsWith("/public-key") && req.method === "GET") {
    const key = publicSigningPem();
    return key ? sendText(res, 200, key, "application/x-pem-file; charset=utf-8") : sendJson(res, 503, { error: "Entitlement signing is not configured", code: "SIGNING_KEY_MISSING" });
  }
  if (pathname.endsWith("/validate") && req.method === "POST") {
    return sendJson(res, 200, await validateLicense(await bodyOf(requestFromNode(req))));
  }
  if ((pathname.endsWith("/activate") || pathname.endsWith("/register")) && req.method === "POST") {
    return sendJson(res, 200, await validateLicense({ ...(await bodyOf(requestFromNode(req))), activate: true }));
  }
  if (pathname.endsWith("/issue") && req.method === "POST") {
    const request = requestFromNode(req);
    const input = await bodyOf(request);
    try {
      return sendJson(res, 200, await issueLicense(request, input));
    } catch (error) {
      if (!(error instanceof AuthorityError) || error.status !== 401) throw error;
      await requireAdmin(request);
      return sendJson(res, 200, await issueLicense(requestWithMasterAuthority(input), input));
    }
  }
  return false;
};

export default async function api(req: IncomingMessage, res: ServerResponse) {
  const requestId = String(req.headers["x-request-id"] || randomUUID());
  res.setHeader("x-request-id", requestId);
  try {
    const rawPath = String(req.url || "/").split("?")[0];
    const pathname = rawPath === "/api" || rawPath === "/api/" ? "/api" : rawPath.startsWith("/api/") ? rawPath : `/api${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;

    if (pathname === "/api/admin" || pathname === "/api/admin/") {
      const html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");
      return sendText(res, 200, html, "text/html; charset=utf-8");
    }
    if (pathname === "/api") return apiIndex(res);
    if (pathname === "/api/admin/licenses/runtime-clients" && req.method === "GET") return sendJson(res, 200, await runtimeClients(requestFromNode(req)));
    if (pathname === "/api/admin/license-master" && req.method === "GET") return sendJson(res, 200, await masterStatus(requestFromNode(req)));
    if (pathname === "/api/admin/license-master/settings") {
      const request = requestFromNode(req);
      if (req.method === "GET") return sendJson(res, 200, await licenseSettings(request));
      if (req.method === "PATCH" || req.method === "POST") return sendJson(res, 200, await licenseSettings(request, await bodyOf(request)));
      return sendJson(res, 405, { error: "Method not allowed" });
    }
    const adminControlMatch = pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/control$/);
    if (adminControlMatch && req.method === "POST") {
      const input = await bodyOf(requestFromNode(req));
      const action = String(input.action || "");
      return sendJson(res, 200, await adminLicenseControl(requestFromNode(req), decodeURIComponent(adminControlMatch[1]), action));
    }

    if (pathname.startsWith("/api/license/")) {
      const handled = await licenseRoute(req, res, pathname);
      if (handled !== false) return handled;
    }
    if (pathname === "/api/license" || pathname === "/api/license/") return sendJson(res, 200, { ok: true, authority: "license-master", api: `${apiBase}/license/v1` });
    if (pathname === "/api/license/validate" && req.method === "POST") return sendJson(res, 200, await validateLicense(await bodyOf(requestFromNode(req))));
    if (pathname === "/api/license/activate" || pathname === "/api/license/register") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
      return sendJson(res, 200, await validateLicense({ ...(await bodyOf(requestFromNode(req))), activate: true }));
    }
    if (pathname === "/api/license/issue" && req.method === "POST") {
      const request = requestFromNode(req);
      const input = await bodyOf(request);
      try {
        return sendJson(res, 200, await issueLicense(request, input));
      } catch (error) {
        if (!(error instanceof AuthorityError) || error.status !== 401) throw error;
        await requireAdmin(request);
        return sendJson(res, 200, await issueLicense(requestWithMasterAuthority(input), input));
      }
    }
    if (pathname === "/api/license/health" && req.method === "GET") return sendJson(res, 200, await health());
    if (pathname === "/api/license/revision" && req.method === "GET") return sendJson(res, 200, revision());
    if (pathname === "/api/license/public-key" && req.method === "GET") {
      const key = publicSigningPem();
      return key ? sendText(res, 200, key, "application/x-pem-file; charset=utf-8") : sendJson(res, 503, { error: "Entitlement signing is not configured", code: "SIGNING_KEY_MISSING" });
    }

    if (pathname === "/api/admin-products-ui" || pathname === "/api/admin-control-ui") return sendJson(res, 404, { error: "Legacy admin UI endpoint removed" });
    if (pathname === "/api/admin-control-login" || pathname === "/api/auth/login") { const { default: adminControlLogin } = await import("./admin-control-login.js"); return adminControlLogin(req, res); }
    if (pathname === "/api/admin-extended" || pathname === "/api/admin-extended/") { const { default: adminExtended } = await import("./admin-extended.js"); return adminExtended(req, res); }
    if (pathname === "/api/admin-settings") { const { default: adminSettings } = await import("./admin-settings.js"); return adminSettings(req, res); }
    if (pathname === "/api/release-capture") { const { default: releaseCapture } = await import("./release-capture.js"); return releaseCapture(req, res); }
    if (pathname === "/api/release-control") { const { default: releaseControl } = await import("./release-control.js"); return releaseControl(req, res); }

    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    const originalUrl = req.url;
    req.url = pathname + (String(originalUrl || "").includes("?") ? String(originalUrl).slice(String(originalUrl).indexOf("?")) : "");
    try {
      const { handler } = await import("../src/server.js");
      return await handler(req, res);
    } finally {
      req.url = originalUrl;
    }
  } catch (error) {
    const status = error instanceof AuthorityError ? error.status : 500;
    sendJson(res, status, {
      error: status >= 500 ? "Master service error" : error instanceof Error ? error.message : "Request failed",
      ...(error instanceof AuthorityError && error.code ? { code: error.code } : {}),
      requestId,
    });
  }
}
