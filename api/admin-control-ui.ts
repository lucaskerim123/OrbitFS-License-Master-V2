import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";

export default function adminControlUi(_req: IncomingMessage, res: ServerResponse) {
  const html = readFileSync(new URL("../web/admin-control.html", import.meta.url), "utf8");
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end(html);
}
