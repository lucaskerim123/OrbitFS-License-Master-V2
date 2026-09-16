import {readFileSync,writeFileSync} from "node:fs";
const path="src/admin-console.ts";
let source=readFileSync(path,"utf8");
if(!source.includes("const licenceKey = licenseKey;")){
  const marker="    return json({ licence: binding, ...(licenseKey ? { licenceKey } : {}), status: binding.status, idempotent: !created }, created ? 201 : 200);";
  if(source.includes(marker))source=source.replace(marker,"    const licenceKey = licenseKey;\n"+marker);
  else {const fallback="    return json({ licence: binding, ...(licenseKey ? { licenceKey } : {}),";if(!source.includes(fallback))throw new Error("admin licence response marker not found");source=source.replace(fallback,"    const licenceKey = licenseKey;\n"+fallback);}
  writeFileSync(path,source);console.log("Fixed admin licence-key compatibility variable.");
}
