import { readFileSync, writeFileSync } from "node:fs";

// Authentication patch only. The admin UI is NEVER served from /api.
const files = ["web/admin-control.html", "web/admin.html"];
for (const file of files) {
  let source = readFileSync(file, "utf8");
  const next = source.replaceAll("/api/auth/login", "/api/admin-control-login");
  if (next !== source) writeFileSync(file, next);
}

const serverFile = "src/server.ts";
let server = readFileSync(serverFile, "utf8");

// Remove the legacy /api/admin-control-ui redirect declaration if an older build left it behind.
server = server.replace(/\n?const adminPage = \(\) => '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=\/api\/admin-control-ui"><script>location\.replace\("\/api\/admin-control-ui"\)<\/script>';/g, "");

const marker = "// ORBITFS_ADMIN_CONTROL_UI_AUTH_PATCH";
if (!server.includes(marker)) {
  const routeMarker = 'if (path === "/api/admin/me" && req.method === "GET") {';
  if (!server.includes(routeMarker)) throw new Error("Admin route insertion marker not found");
  const route = 'if (path === "/api/admin-control-login" && req.method === "POST") return adminControlLogin(req, res);\n    if (path === "/api/auth/login" && req.method === "POST") return adminControlLogin(req, res);\n    ';
  if (server.includes("const adminControlLogin = async")) {
    server = server.replace(routeMarker, `// ${marker}\n    ${route}${routeMarker}`);
  }
}
writeFileSync(serverFile, server);
