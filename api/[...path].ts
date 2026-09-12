import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

export default async function api(req: IncomingMessage, res: ServerResponse) {
  try {
    const pathname = String(req.url || "").split("?")[0];

    // Vercel's /admin rewrite can arrive here as /api/admin. Handle both
    // forms so the public custom domain never falls through to the API 404.
    if (pathname === "/admin" || pathname === "/admin/" || pathname === "/api/admin" || pathname === "/api/admin/") {
      const html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store, max-age=0");
      return res.end(html);
    }

    if (pathname === "/api/products") {
      const { default: products } = await import("./products.js");
      return products(req, res);
    }
    if (pathname === "/api/admin-products-ui") {
      const { default: productsUi } = await import("./admin-products-ui.js");
      return productsUi(req, res);
    }
    if (pathname === "/api/admin-control-ui") {
      const { default: adminControlUi } = await import("./admin-control-ui.js");
      return adminControlUi(req, res);
    }
    if (pathname === "/api/admin-control-login" || pathname === "/api/auth/login") {
      const { default: adminControlLogin } = await import("./admin-control-login.js");
      return adminControlLogin(req, res);
    }
    const { handler } = await import("../src/server.js");
    return handler(req, res);
  } catch (error) {
    const requestId = String(req.headers["x-request-id"] || randomUUID());
    console.error(JSON.stringify({
      requestId,
      phase: "module_initialization",
      error: error instanceof Error ? error.stack || error.message : String(error),
    }));
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("x-request-id", requestId);
    res.end(JSON.stringify({ error: "Master function initialization failed", requestId }));
  }
}
