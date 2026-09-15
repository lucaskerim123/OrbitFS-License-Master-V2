import type { IncomingMessage, ServerResponse } from "node:http";
import { runtimeClients } from "../src/new-api-admin.js";

const requestFromNode = (req: IncomingMessage) => new Request(`https://${req.headers.host || "www.incendiarynetworks.cc"}${req.url || "/api/admin/licenses/runtime-clients"}`, {
  method: req.method,
  headers: new Headers(req.headers as Record<string, string>),
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") { res.statusCode = 405; return res.end(JSON.stringify({ error: "Method not allowed" })); }
    const result = await runtimeClients(requestFromNode(req));
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
