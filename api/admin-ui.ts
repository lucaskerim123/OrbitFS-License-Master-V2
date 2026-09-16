import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAdminConsole } from "../src/admin-console.js";

const send = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};

export default async function adminUi(req: IncomingMessage, res: ServerResponse) {
  const host = String(req.headers.host || "license-master");
  const requestUrl = `https://${host}${req.url || "/admin"}`;
  const url = new URL(requestUrl);
  try {
    const routedPath = url.searchParams.get("path");
    if (req.method === "GET" && !routedPath && (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/api/admin-ui")) {
      const html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store, max-age=0");
      res.end(html);
      return;
    }
    const internalPath = routedPath ? `/admin/${routedPath.replace(/^\/+/, "")}` : url.pathname;
    const response = await handleAdminConsole(new Request(requestUrl, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: ["GET", "HEAD"].includes(String(req.method)) ? undefined : req,
      duplex: "half",
    } as RequestInit), internalPath);
    if (!response) return send(res, 404, { error: "Admin operation not found" });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    send(res, status, { error: error instanceof Error ? error.message : "License Master admin service error" });
  }
}
