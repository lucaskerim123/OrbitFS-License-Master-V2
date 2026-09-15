import type { IncomingMessage, ServerResponse } from "node:http";
import { adminLicenseControl, bodyOf } from "../src/new-api-admin.js";

const requestFromNode = (req: IncomingMessage) => new Request(`https://${req.headers.host || "www.incendiarynetworks.cc"}${req.url || "/api/admin/licenses"}`, {
  method: req.method,
  headers: new Headers(req.headers as Record<string, string>),
  body: ["GET", "HEAD"].includes(String(req.method)) ? undefined : req,
  duplex: "half",
} as RequestInit);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "POST" && req.method !== "PATCH") { res.statusCode = 405; return res.end(JSON.stringify({ error: "Method not allowed" })); }
    const url = new URL(`https://${req.headers.host || "www.incendiarynetworks.cc"}${req.url || "/"}`);
    const match = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/control$/);
    const id = match ? decodeURIComponent(match[1]) : url.searchParams.get("id") || "";
    if (!id) { res.statusCode = 400; return res.end(JSON.stringify({ error: "License ID is required" })); }
    const input = await bodyOf(requestFromNode(req));
    const action = String(input.action || url.searchParams.get("action") || "");
    const result = await adminLicenseControl(requestFromNode(req), id, action);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    return res.end(JSON.stringify(result));
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: status >= 500 ? "Master service error" : String(error?.message || "Request failed"), ...(error?.code ? { code: error.code } : {}) }));
  }
}
