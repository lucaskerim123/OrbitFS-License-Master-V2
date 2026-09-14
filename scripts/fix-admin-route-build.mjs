import { readFileSync, writeFileSync } from "node:fs";

// Keep the admin console at /admin. Authentication and data APIs remain under /api.
const file = "src/server.ts";
let source = readFileSync(file, "utf8");
const adminPage = `const adminPage = () => {
  const html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");
  return html.replace("__SUPABASE_URL__", JSON.stringify(SUPABASE_URL)).replace("__SUPABASE_ANON_KEY__", JSON.stringify(SUPABASE_ANON_KEY));
};\n\n`;
const definition = /const adminPage = \(\) => \{[\s\S]*?\n\};/;
if (definition.test(source)) {
  source = source.replace(definition, adminPage.trimEnd());
} else {
  const marker = "const adminControlLogin = async";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error("Admin route insertion point not found");
  source = source.slice(0, markerIndex) + adminPage + source.slice(markerIndex);
}
writeFileSync(file, source);

const publicAdmin = "public/admin/index.html";
let html = readFileSync(publicAdmin, "utf8");
html = html.replace(/\s*<meta http-equiv="refresh"[^>]*>/i, "").replace(/\s*<script>location\.replace\([^<]+<\/script>/i, "");
writeFileSync(publicAdmin, html);

const adminIndex = "admin/index.html";
let index = readFileSync(adminIndex, "utf8");
index = index.replace(/<iframe[^>]*>\s*<\/iframe>/i, "").replace(/<iframe[^>]*\/>/i, "");
writeFileSync(adminIndex, index);

console.log("Canonical admin UI entry fixed: /admin stays UI; /api stays API; authentication remains /api/admin-control-login.");
