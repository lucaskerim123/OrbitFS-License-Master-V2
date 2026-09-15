import type { IncomingMessage, ServerResponse } from "node:http";
import { bodyOf, licenseSettings } from "../src/new-api-admin.js";

const requestFromNode = (req: IncomingMessage) => new Request(`https://${req.headers.host || "www.incendiarynetworks.cc"}${req.url || "/api/admin/license-master/settings"}`, {
  method: req.method,
  headers: new Headers(req.headers as Record<string, string>),
  body: ["GET", "HEAD"].includes(String(req.method)) ? undefined : req,
  duplex: "half",
} as RequestInit);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!["GET", "PATCH", "POST"].includes(String(req.method))) { res.statusCode = 405; return res.end(JSON.stringify({ error: "Method not allowed" })); }
    const request = requestFromNode(req);
    const result = req.method === "GET" ? await licenseSettings(request) : await licenseSettings(request, await bodyOf(request));
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
