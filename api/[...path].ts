import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

function legacyPath(pathname: string): string {
  const exact = new Map<string,string>([
    ["/api/products","/api/v1/products"],
    ["/api/settings","/api/v1/settings"],
    ["/api/licenses","/api/v1/licenses"],
    ["/api/license/validate","/api/v1/license/validate"],
    ["/api/license/issue","/api/v1/license/issue"],
    ["/api/license/revision","/api/v1/license/revision"],
    ["/api/license/public-key","/api/v1/license/public-key"],
    ["/api/releases","/api/v1/releases"],
    ["/api/releases/latest","/api/v1/releases/latest"],
    ["/api/installations","/api/v1/installations"],
    ["/api/deployments","/api/v1/deployments"],
    ["/api/deployments/execute","/api/v1/deployments/execute"],
    ["/api/deployments/sync","/api/v1/deployments/sync"],
  ]);
  if (exact.has(pathname)) return exact.get(pathname)!;
  if (pathname.startsWith("/api/license/") && pathname.endsWith("/control")) return `/api/v1${pathname.slice(4)}`;
  if (pathname.startsWith("/api/releases/")) return `/api/v1${pathname.slice(4)}`;
  if (pathname.startsWith("/api/installations/")) return `/api/v1${pathname.slice(4)}`;
  if (pathname.startsWith("/api/deployments/")) return `/api/v1${pathname.slice(4)}`;
  return pathname;
}

export default async function api(req: IncomingMessage, res: ServerResponse) {
  try {
    const rawUrl = String(req.url || "/");
    const rawPath = rawUrl.split("?")[0];
    const pathname = rawPath === "/api" || rawPath === "/api/" ? "/api" : rawPath.startsWith("/api/") ? rawPath : `/api${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;

    if (pathname === "/api/admin" || pathname === "/api/admin/") {
      const html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store, max-age=0");
      return res.end(html);
    }
    if (pathname === "/api/admin-products-ui") { const { default: x } = await import("./admin-products-ui.js"); return x(req,res); }
    if (pathname === "/api/admin-control-ui") { const { default: x } = await import("./admin-control-ui.js"); return x(req,res); }
    if (pathname === "/api/admin-control-login" || pathname === "/api/auth/login") { const { default: x } = await import("./admin-control-login.js"); return x(req,res); }
    if (pathname === "/api/admin-extended" || pathname === "/api/admin-extended/") { const { default: x } = await import("./admin-extended.js"); return x(req,res); }
    if (pathname === "/api/admin-settings") { const { default: x } = await import("./admin-settings.js"); return x(req,res); }

    // Canonical public API paths are translated internally to the existing
    // License Master implementation. The legacy paths are not exposed to
    // Billing Store; this keeps one authority without duplicating logic.
    const internalPath = legacyPath(pathname);
    const originalUrl = req.url;
    req.url = internalPath + (rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "");
    const { handler } = await import("../src/server.js");
    const result = await handler(req,res);
    req.url = originalUrl;
    return result;
  } catch (error) {
    const requestId = String(req.headers["x-request-id"] || randomUUID());
    console.error(JSON.stringify({requestId,phase:"module_initialization",error:error instanceof Error ? error.stack || error.message : String(error)}));
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("x-request-id", requestId);
    res.end(JSON.stringify({ error: "Master function initialization failed", requestId }));
  }
}
