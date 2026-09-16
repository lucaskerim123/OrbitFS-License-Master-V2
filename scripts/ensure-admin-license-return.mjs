import {readFileSync,writeFileSync} from "node:fs";
const path="src/admin-console.ts";
let source=readFileSync(path,"utf8");
const bad="...(licenceKey ? { licenceKey } : {})";
const good="...(licenseKey ? { licenceKey: licenseKey } : {})";
if(source.includes(bad)){source=source.replaceAll(bad,good);writeFileSync(path,source);console.log("Fixed admin licence-key response variable.");}
