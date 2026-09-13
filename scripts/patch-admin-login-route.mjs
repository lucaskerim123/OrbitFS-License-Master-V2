import { readFileSync, writeFileSync } from "node:fs";

const files = ["web/admin-control.html", "web/admin.html"];
for (const file of files) {
  let source = readFileSync(file, "utf8");
  const next = source.replaceAll("/api/auth/login", "/api/admin-control-login");
  if (next !== source) writeFileSync(file, next);
}
