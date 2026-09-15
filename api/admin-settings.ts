import type { IncomingMessage, ServerResponse } from 'node:http';
import { licenseSettings } from '../src/new-api-admin.js';

export default async function adminSettings(req: IncomingMessage, res: ServerResponse) {
  const host = String(req.headers.host || 'www.incendiarynetworks.cc');
  const url = `https://${host}/api/admin/settings`;
  try {
    const request = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: ['GET', 'HEAD'].includes(String(req.method)) ? undefined : req,
      duplex: 'half'
    } as RequestInit);
    const input = ['GET', 'HEAD'].includes(String(req.method)) ? undefined : await request.clone().json().catch(() => ({}));
    const result = await licenseSettings(request, input);
    res.statusCode = 200;
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Master service error';
    res.statusCode = /not authenticated|forbidden/i.test(message) ? 401 : 500;
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: message }));
  }
}
