import { licenseSettings } from '../src/new-api-admin.js';

export default async function adminSettings(req: Request) {
  try {
    const input = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.json().catch(() => ({}));
    const result = await licenseSettings(req, input);
    return Response.json(result, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Master service error';
    const status = /not authenticated|forbidden/i.test(message) ? 401 : 500;
    return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
  }
}
