import type { IncomingMessage, ServerResponse } from "node:http";
import { handler } from "../../src/server.js";

/**
 * Canonical public v1 compatibility surface.
 * The License Master implementation is hosted under /api/* internally;
 * this adapter keeps /api/v1/* as the stable integration contract without
 * duplicating the authority or business logic.
 */
export default async function apiV1(req: IncomingMessage, res: ServerResponse) {
  const original = String(req.url || "/api/v1");
  req.url = original === "/api/v1" || original === "/api/v1/"
    ? "/api"
    : original.replace(/^\/api\/v1(?=\/|$)/, "/api");
  try {
    return await handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Master service error" }));
  }
}
