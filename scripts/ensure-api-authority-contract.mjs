import { readFileSync, writeFileSync } from "node:fs";

const file = "src/server.ts";
let source = readFileSync(file, "utf8");
const oldBlock = `async function settings(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });`;
const newBlock = `async function settings(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "GET") {
    if (!allowed(req, ["master", "billing", "deployer"])) return json(res, 401, { error: "Unauthorized" });
  } else if (!allowed(req, ["master"])) {
    return json(res, 401, { error: "Unauthorized" });
  }
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });`;
if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock, 1);
} else if (!source.includes("if (req.method === \"GET\") {\n    if (!allowed(req, [\"master\", \"billing\", \"deployer\"]))")) {
  throw new Error("License Master settings authority marker not found");
}
writeFileSync(file, source);
console.log("License Master settings are readable by billing/deployer and writable only by master");
