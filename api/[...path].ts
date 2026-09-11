import type { IncomingMessage, ServerResponse } from "node:http";
import { handler } from "../src/server.ts";

export default function api(req: IncomingMessage, res: ServerResponse) {
  return handler(req, res);
}
