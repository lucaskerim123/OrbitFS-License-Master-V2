import { readFileSync, writeFileSync } from 'node:fs';

const serverPath = new URL('../src/server.ts', import.meta.url);
let server = readFileSync(serverPath, 'utf8');
const marker = '    // LICENSE_API_MODE_GATE_V1';
if (!server.includes(marker)) {
  const block = [
    marker,
    '    if (path.startsWith("/api/license/") && !path.startsWith("/api/license/admin/")) {',
    '      try {',
    '        const gate = (await query<JsonObject>("select enabled,api_mode from master_license_settings where id=\'primary\' limit 1")).rows[0] as JsonObject | undefined;',
    '        const enabled = gate?.enabled !== false;',
    '        const mode = String(gate?.api_mode || "online").toLowerCase();',
    '        if (!enabled || mode === "offline" || mode === "maintenance") return json(res, 503, { error: mode === "maintenance" ? "License Master API is in maintenance mode" : "License Master API is offline", code: mode === "maintenance" ? "API_MAINTENANCE" : "API_OFFLINE" });',
    '      } catch {}',
    '    }',
  ].join("\\n") + "\\n";
  const needle = '    if (path === "/") {';
  if (!server.includes(needle)) throw new Error('handler insertion point not found');
  server = server.replace(needle, block + needle);
  writeFileSync(serverPath, server);
}
console.log('License Master API mode gate enabled.');
