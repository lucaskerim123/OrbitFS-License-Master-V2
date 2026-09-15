import type { IncomingMessage, ServerResponse } from "node:http";
import { licenseSettings } from "../../../src/new-api-admin.js";

const requestFromNode = (req: IncomingMessage) => new Request(`https://${req.headers.host || "incendiarynetworks.cc"}${req.url || "/api/admin/license-master/settings"}`, {
  method: req.method,
  headers: new Headers(req.headers as Record<string, string>),
  body: ["GET", "HEAD"].includes(String(req.method)) ? undefined : req,
  duplex: "half",
} as RequestInit);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const request = requestFromNode(req);
    if (req.method === "GET") {
      const result = await licenseSettings(request);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      return res.end(JSON.stringify(result));
    }
    if (req.method === "PATCH" || req.method === "POST") {
      const input = await request.json();
      const result = await licenseSettings(request, input as Record<string, unknown>);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      return res.end(JSON.stringify(result));
    }
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: status >= 500 ? "Master service error" : String(error?.message || "Request failed"), ...(error?.code ? { code: error.code } : {}) }));
  }
}
