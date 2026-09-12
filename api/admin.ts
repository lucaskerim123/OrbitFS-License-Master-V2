import type { IncomingMessage, ServerResponse } from "node:http";
import adminControlUi from "./admin-control-ui.js";

export default function admin(req: IncomingMessage, res: ServerResponse) {
  return adminControlUi(req, res);
}
