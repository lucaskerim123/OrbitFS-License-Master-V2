import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../web/admin.html', import.meta.url);
let html = readFileSync(path, 'utf8');

const old = `async function start(){try{await api('/api/admin/license-master');$('login').classList.add('hidden');$('app').classList.remove('hidden');await loadStatus()}catch(e){sessionStorage.removeItem(tokenKey);token='';$('login').classList.remove('hidden');$('app').classList.add('hidden');$('loginError').textContent=e.message}}`;
const next = `async function start(){
  if(!token){$('login').classList.remove('hidden');$('app').classList.add('hidden');return}
  $('login').classList.add('hidden');$('app').classList.remove('hidden');
  await loadStatus();
}`;

if (html.includes(old)) {
  html = html.replace(old, next);
}

const settingsOld = `api('/api/admin/settings')`;
const settingsNew = `api('/api/admin-settings')`;
if (html.includes(settingsOld)) {
  html = html.replaceAll(settingsOld, settingsNew);
}

writeFileSync(path, html);
console.log('Admin auth/settings UI normalized.');
