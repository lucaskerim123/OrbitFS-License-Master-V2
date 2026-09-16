import { query } from './new-api-db.js';
import { adminLicenseControl, issueLicense, requireAdmin } from './new-api-authority.js';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const body = async (req: Request) => { const v = await req.json().catch(() => ({})); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}; };
const internalMasterRequest = (input: Record<string, unknown>) => new Request('https://license-master.internal/internal/issue', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MASTER_API_TOKEN || ''}` }, body: JSON.stringify(input) });
const PRODUCT_CODES = ['orbitfs_base','orbitfs_mcp','orbitfs_apex','orbitfs_studio'];

export async function handleAdminConsole(req: Request, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith('/admin-api/')) return null;
  await requireAdmin(req);
  if (pathname === '/admin-api/licenses' && req.method === 'GET') {
    const rows = (await query<any>('select * from license_bindings where archived_at is null order by created_at desc limit 500')).rows;
    return json({ licenses: rows.map((x: any) => { const r = { ...x }; delete r.license_key_hash; delete r.license_key_last4; return r; }) });
  }
  const controlMatch = pathname.match(/^\/admin-api\/licenses\/([^/]+)\/control$/);
  if (controlMatch && req.method === 'POST') { const input = await body(req); return json(await adminLicenseControl(req, decodeURIComponent(controlMatch[1]), String(input.action || ''))); }
  if (pathname === '/admin-api/licenses/issue' && req.method === 'POST') { const input = await body(req); return json(await issueLicense(internalMasterRequest(input), input), 201); }
  if (pathname === '/admin-api/releases' && req.method === 'GET') return json({ releases: (await query<any>('select * from releases order by updated_at desc limit 500')).rows });
  if (pathname === '/admin-api/releases' && req.method === 'POST') {
    const input = await body(req); const component = String(input.component || 'orbitfs_base'); const channel = String(input.channel || (component === 'orbitfs_base' ? 'base' : 'update')); const version = String(input.version || '').trim();
    if (!version) return json({ error: 'Version is required' }, 400);
    const existing = (await query<any>('select * from releases where component=$1 and channel=$2 and version=$3 limit 1', [component, channel, version])).rows[0];
    if (existing) return json({ release: existing, idempotent: true });
    const release = (await query<any>(`insert into releases (id,component,version,channel,status,title,description,changelog,customer_notes,internal_notes,severity,required,rollout,minimum_version,rollback_version,schema_version,checkpoint_required,components,manifest,permissions,compatibility,source_commit) values(gen_random_uuid(),$1,$2,$3,'draft',$4,'',$5,'','',$6,false,'internal',null,null,'1',false,$7,'{}','{}','{}',$8) returning *`, [component, version, channel, String(input.title || 'OrbitFS ' + version), String(input.changelog || ''), String(input.severity || 'normal'), input.components || [], input.sourceCommit || null])).rows[0];
    return json({ release }, 201);
  }
  const releaseAction = pathname.match(/^\/admin-api\/releases\/([^/]+)\/(validate|publish|pause|withdraw)$/);
  if (releaseAction && req.method === 'POST') {
    const id = decodeURIComponent(releaseAction[1]); const action = releaseAction[2]; const row = (await query<any>('select * from releases where id=$1', [id])).rows[0];
    if (!row) return json({ error: 'Release not found' }, 404);
    if (action === 'validate') await query("update releases set status='validated',updated_at=now() where id=$1", [id]);
    else if (action === 'publish') { if (row.status !== 'validated') return json({ error: 'Release must be validated before publishing' }, 409); await query("update releases set status='published',published_at=now(),published_by='admin',updated_at=now() where id=$1", [id]); }
    else await query('update releases set status=$1,updated_at=now() where id=$2', [action === 'pause' ? 'paused' : 'withdrawn', id]);
    return json({ ok: true, release: (await query<any>('select * from releases where id=$1', [id])).rows[0] });
  }
  if (pathname === '/admin-api/deployments' && req.method === 'GET') return json({ jobs: (await query<any>('select * from deployment_jobs order by created_at desc limit 200')).rows });
  if (pathname === '/admin-api/installations' && req.method === 'GET') return json({ installations: (await query<any>('select * from orbitfs_installations order by updated_at desc limit 500')).rows });
  if (pathname === '/admin-api/products' && req.method === 'GET') return json({ products: (await query<any>('select * from license_products where code = any($1::text[]) order by sort_order asc, code asc limit 500', [PRODUCT_CODES])).rows });
  if (pathname === '/admin-api/settings' && req.method === 'GET') return json({ settings: (await query<any>("select * from master_license_settings where id='primary' limit 1")).rows[0] || null });
  return null;
}
