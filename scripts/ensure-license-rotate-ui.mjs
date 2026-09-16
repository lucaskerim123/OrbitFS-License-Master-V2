import { readFileSync, writeFileSync } from 'node:fs';

const path = 'web/admin.html';
let html = readFileSync(path, 'utf8');
const marker = '<button class="btn" style="width:auto" onclick="control(\'unlock\')">Unlock</button>';
const rotate = '<button class="btn" style="width:auto" onclick="control(\'rotate\')">Rotate Key</button>';
if (html.includes(marker) && !html.includes("control('rotate')")) html = html.replace(marker, `${marker}${rotate}`);
writeFileSync(path, html);
console.log('OrbitFS License Master rotate-key control added to admin UI');
