import {readFileSync,writeFileSync} from "node:fs";

const path="src/server.ts";
let source=readFileSync(path,"utf8");
const old='if (!authenticated && !allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });';
const next='if (!authenticated && !allowed(req, ["master", "billing"])) return json(res, 401, { error: "Unauthorized" });';
if(source.includes(next))process.exit(0);
if(!source.includes(old))throw new Error("billing license control marker not found");
source=source.replace(old,next);
writeFileSync(path,source);
console.log("License control accepts the Billing service role.");
