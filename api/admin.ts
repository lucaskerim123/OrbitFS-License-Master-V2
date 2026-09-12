import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Canonical /admin entry. Keep this function self-contained for Vercel. */
export default function admin(_req: IncomingMessage, res: ServerResponse) {
  try {
    const html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store, max-age=0");
    res.end(html);
  } catch (error) {
    console.error("Failed to load License Master admin UI", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Admin UI unavailable" }));
  }
}
