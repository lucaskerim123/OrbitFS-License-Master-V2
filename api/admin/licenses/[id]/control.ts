import type { IncomingMessage, ServerResponse } from "node:http";
import { adminLicenseControl } from "../../../../src/new-api-admin.js";

const requestFromNode = (req: IncomingMessage) => new Request(`https://${req.headers.host || "incendiarynetworks.cc"}${req.url || "/"}`, {
  method: req.method,
  headers: new Headers(req.headers as Record<string, string>),
  body: ["GET", "HEAD"].includes(String(req.method)) ? undefined : req,
  duplex: "half",
} as RequestInit);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: "Method not allowed" })); }
    const match = String(req.url || "").split("?")[0].match(/\/api\/admin\/licenses\/([^/]+)\/control$/);
    const id = match ? decodeURIComponent(match[1]) : "";
    const input = await requestFromNode(req).json() as Record<string, unknown>;
    const result = await adminLicenseControl(requestFromNode(req), id, String(input.action || ""));
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
