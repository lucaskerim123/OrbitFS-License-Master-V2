import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'src/server.ts',
  'src/admin-console.ts',
  'src/new-api-authority.ts',
];

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = before.replaceAll('`OFS-', '`ORBITFS-');
  if (after !== before) writeFileSync(file, after);
}

console.log('OrbitFS license key format normalized to ORBITFS-XXXX-XXXX-XXXX');
