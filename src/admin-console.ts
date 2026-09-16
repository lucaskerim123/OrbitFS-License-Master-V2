import { createHash, randomUUID } from 'node:crypto';
import { query } from './new-api-db.js';
import { adminLicenseControl } from './new-api-admin.js';
import { requireAdmin } from './new-api-authority.js';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const body = async (req: Request) => { const v = await req.json().catch(() => ({})); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}; };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const newLicenseKey = () => { const value = randomUUID().replaceAll('-', '').toUpperCase(); return `OFS-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`; };
const PRODUCT_CODES = ['orbitfs_base','orbitfs_mcp','orbitfs_apex','orbitfs_studio'];

async function issueLicenseInternal(input: Record<string, unknown>) {
  const orderRef = String(input.orderRef || '').trim();
  if (!orderRef || orderRef.length > 200) return json({ error: 'Order reference is required' }, 400);
  const client = await import('./new-api-db.js').then(m => m.pool?.connect?.()).catch(() => null);
  if (!client) return json({ error: 'Database is not configured' }, 503);
  let created = false;
  try {
    await client.query('begin');
    const existing = (await client.query('select * from license_bindings where order_ref=$1 and archived_at is null for update', [orderRef])).rows[0] as Record<string, unknown> | undefined;
    let binding: Record<string, unknown>;
    let licenseKey: string | undefined;
    if (existing) {
      binding = existing;
      licenseKey = (await client.query('select license_key from license_key_delivery where binding_id=$1 order by created_at desc limit 1', [existing.id])).rows[0]?.license_key;
    } else {
      const n = Number(input.maxInstallations ?? 1);
      const maxInstallations = Number.isFinite(n) ? Math.max(1, Math.min(100, Math.floor(n))) : 1;
      const components = input.components && typeof input.components === 'object' && !Array.isArray(input.components) ? input.components : {};
      licenseKey = newLicenseKey();
      binding = (await client.query(`insert into license_bindings (id,customer_ref,order_ref,product_code,status,desired_state,remote_state,expires_at,max_installations,components,metadata,license_key_hash,license_key_last4,notes) values($1,$2,$3,$4,'active','active','active',$5,$6,$7,$8,$9,$10,$11) on conflict (order_ref) where archived_at is null do update set updated_at=license_bindings.updated_at returning *`, [randomUUID(), String(input.customerRef || ''), orderRef, String(input.productCode || 'orbitfs_base'), input.expiresAt || null, maxInstallations, components, input.metadata || {}, hash(licenseKey), licenseKey.slice(-4), input.notes || null])).rows[0] as Record<string, unknown>;
      created = binding.license_key_hash === hash(licenseKey);
      if (created) {
        await client.query('insert into license_key_delivery(binding_id,customer_ref,license_key) values($1,$2,$3)', [binding.id, String(input.customerRef || ''), licenseKey]);
        await client.query(`insert into license_fulfillments(order_ref,customer_ref,product_code,state,binding_id,license_id,fulfilled_at,metadata) values($1,$2,$3,'fulfilled',$4,$4,now(),$5) on conflict(order_ref) do nothing`, [orderRef, String(input.customerRef || ''), String(input.productCode || 'orbitfs_base'), binding.id, { components }]);
        await client.query("insert into audit_log(id,entity_type,entity_id,action,actor_ref,detail) values($1,'licence',$2,'issued','master-panel',$3)", [randomUUID(), binding.id, { orderRef }]);
      }
    }
    await client.query('commit');
    return json({ licence: binding, ...(licenseKey ? { licenceKey } : {}), status: binding.status, idempotent: !created }, created ? 201 : 200);
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

export async function handleAdminConsole(req: Request, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith('/admin/')) return null;
  await requireAdmin(req);
  if (pathname === '/admin/licenses' && req.method === 'GET') {
    const rows = (await query<any>('select * from license_bindings where archived_at is null order by created_at desc limit 500')).rows;
    return json({ licenses: rows.map((x: any) => { const r = { ...x }; delete r.license_key_hash; delete r.license_key_last4; return r; }) });
  }
  const controlMatch = pathname.match(/^\/admin\/licenses\/([^/]+)\/control$/);
  if (controlMatch && req.method === 'POST') { const input = await body(req); return json(await adminLicenseControl(req, decodeURIComponent(controlMatch[1]), String(input.action || ''))); }
  if (pathname === '/admin/licenses/issue' && req.method === 'POST') return issueLicenseInternal(await body(req));
  if (pathname === '/admin/releases' && req.method === 'GET') return json({ releases: (await query<any>('select * from releases order by updated_at desc limit 500')).rows });
  if (pathname === '/admin/releases' && req.method === 'POST') {
    const input = await body(req); const component = String(input.component || 'orbitfs_base'); const channel = String(input.channel || (component === 'orbitfs_base' ? 'base' : 'update')); const version = String(input.version || '').trim();
    if (!version) return json({ error: 'Version is required' }, 400);
    const existing = (await query<any>('select * from releases where component=$1 and channel=$2 and version=$3 limit 1', [component, channel, version])).rows[0];
    if (existing) return json({ release: existing, idempotent: true });
    const release = (await query<any>(`insert into releases (id,component,version,channel,status,title,description,changelog,customer_notes,internal_notes,severity,required,rollout,minimum_version,rollback_version,schema_version,checkpoint_required,components,manifest,permissions,compatibility,source_commit) values(gen_random_uuid(),$1,$2,$3,'draft',$4,'',$5,'','',$6,false,'internal',null,null,'1',false,$7,'{}','{}','{}',$8) returning *`, [component, version, channel, String(input.title || 'OrbitFS ' + version), String(input.changelog || ''), String(input.severity || 'normal'), input.components || [], input.sourceCommit || null])).rows[0];
    return json({ release }, 201);
  }
  const releaseAction = pathname.match(/^\/admin\/releases\/([^/]+)\/(validate|publish|pause|withdraw)$/);
  if (releaseAction && req.method === 'POST') {
    const id = decodeURIComponent(releaseAction[1]); const action = releaseAction[2]; const row = (await query<any>('select * from releases where id=$1', [id])).rows[0];
    if (!row) return json({ error: 'Release not found' }, 404);
    if (action === 'validate') await query("update releases set status='validated',updated_at=now() where id=$1", [id]);
    else if (action === 'publish') { if (row.status !== 'validated') return json({ error: 'Release must be validated before publishing' }, 409); await query("update releases set status='published',published_at=now(),published_by='master-panel',updated_at=now() where id=$1", [id]); }
    else await query('update releases set status=$1,updated_at=now() where id=$2', [action === 'pause' ? 'paused' : 'withdrawn', id]);
    return json({ ok: true, release: (await query<any>('select * from releases where id=$1', [id])).rows[0] });
  }
  if (pathname === '/admin/deployments' && req.method === 'GET') return json({ jobs: (await query<any>('select * from deployment_jobs order by created_at desc limit 200')).rows });
  if (pathname === '/admin/installations' && req.method === 'GET') return json({ installations: (await query<any>('select * from orbitfs_installations order by updated_at desc limit 500')).rows });
  if (pathname === '/admin/products' && req.method === 'GET') return json({ products: (await query<any>('select * from license_products where code = any($1::text[]) order by sort_order asc, code asc limit 500', [PRODUCT_CODES])).rows });
  if (pathname === '/admin/settings' && req.method === 'GET') return json({ settings: (await query<any>("select * from master_license_settings where id='primary' limit 1")).rows[0] || null });
  return null;
}
