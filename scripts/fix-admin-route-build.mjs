import { readFileSync, writeFileSync } from "node:fs";

// The admin console is served at /admin. Its authentication and data APIs stay
// under /api; the browser must never be redirected to an API UI endpoint.
const file = "src/server.ts";
let source = readFileSync(file, "utf8");
const redirect = /const adminPage = \(\) => \{[\s\S]*?\n\};/;
const replacement = `const adminPage = () => {
  const html = readFileSync(new URL("../web/admin.html", import.meta.url), "utf8");
  return html.replace("__SUPABASE_URL__", JSON.stringify(SUPABASE_URL)).replace("__SUPABASE_ANON_KEY__", JSON.stringify(SUPABASE_ANON_KEY));
};`;
if (!redirect.test(source)) throw new Error("adminPage definition not found");
source = source.replace(redirect, replacement);
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
