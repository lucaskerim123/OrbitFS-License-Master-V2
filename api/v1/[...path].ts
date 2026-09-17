import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { handler } from "../../src/server.js";

/**
 * Canonical public v1 compatibility surface.
 * The License Master implementation is hosted under /api/* internally;
 * this adapter keeps /api/v1/* as the stable integration contract without
 * duplicating the authority or business logic.
 *
 * Billing Store may request license control through its billing integration
 * token. The adapter delegates that request to the same License Master
 * control handler using the Master credential; Billing Store never receives
 * or stores Master authority.
 */
const sameSecret = (actual: string, expected: string) => {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export default async function apiV1(req: IncomingMessage, res: ServerResponse) {
  const original = String(req.url || "/api/v1");
  const normalized = original === "/api/v1" || original === "/api/v1/"
    ? "/api"
    : original.replace(/^\/api\/v1(?=\/|$)/, "/api");

  if (req.method === "POST" && /^\/api\/license\/[^/]+\/control(?:\?.*)?$/.test(normalized)) {
    const authorization = String(req.headers.authorization || "");
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const billing = String(process.env.BILLING_API_TOKEN || "");
    const master = String(process.env.MASTER_API_TOKEN || "");
    if (sameSecret(token, billing) && master) {
      req.headers.authorization = `Bearer ${master}`;
    }
  }

  req.url = normalized;
  try {
    return await handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Master service error" }));
  }
}
