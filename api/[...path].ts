import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export default async function api(req: IncomingMessage, res: ServerResponse) {
  try {
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
