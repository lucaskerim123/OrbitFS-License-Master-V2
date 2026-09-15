import {readFileSync,writeFileSync} from 'node:fs';

const file=new URL('../web/admin.html',import.meta.url);
let html=readFileSync(file,'utf8');

const marker='/* ORBITFS_SETTINGS_UI_FIX_V2 */';
if(!html.includes(marker)){
  const js=`\n${marker}\nasync function loadSettings(){try{const d=await api('/api/admin/settings');const s=d.settings||{};const raw=String(s.api_mode||'').toLowerCase();const mode=['online','maintenance','offline'].includes(raw)?raw:(String(s.mode||'').toLowerCase()==='active'?'online':'online');$('setMode').value=mode;$('setEnabled').checked=s.enabled!==false;$('setGrace').checked=s.allow_offline_grace!==false;$('setIssuer').value=s.issuer||'orbitfs-license-master';$('setAudience').value=s.audience||'orbitfs-runtime';$('setTtl').value=Number(s.entitlement_ttl_seconds||10800);$('setGraceSeconds').value=Number(s.grace_seconds||604800);$('settingsBody').textContent=JSON.stringify({...s,api_mode:mode},null,2);$('settingsState').textContent=(s.enabled===false?'DISABLED':mode.toUpperCase());$('settingsState').className='badge '+(s.enabled===false||mode!=='online'?'warn':'');}catch(e){$('settingsMsg').textContent=e.message}}\n`;
  html=html.replace('</script>',js+'</script>');
  writeFileSync(file,html);
}
