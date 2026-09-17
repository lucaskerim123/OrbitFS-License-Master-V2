import {readFileSync,writeFileSync} from "node:fs";

const path="src/server.ts";
let source=readFileSync(path,"utf8");
const controlOld='if (!authenticated && !allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });';
const controlNext='if (!authenticated && !allowed(req, ["master", "billing"])) return json(res, 401, { error: "Unauthorized" });';
if(source.includes(controlOld)) source=source.replace(controlOld,controlNext);
const issueOld='if (!authenticated && !allowed(req, ["master"])) return json(res, 401, { error: "Unauthorized" });';
if(source.includes(issueOld)) source=source.replace(issueOld,controlNext);
const issueRoute='if (path === "/api/license/issue" && req.method === "POST") return issue(req, res);';
if(!source.includes(issueRoute)) throw new Error("billing license issue route marker not found");
if(!source.includes('if (!authenticated && !allowed(req, ["master", "billing"])) return json(res, 401, { error: "Unauthorized" });')) throw new Error("billing license authorization marker not found");
writeFileSync(path,source);
console.log("License issuance and control accept the Billing service role; release source remains release-updates.");
