import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAdminConsole } from '../src/admin-console.js';

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
    const response = await handleAdminConsole(request, '/api/admin/settings');
    if (!response) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = error instanceof Error && /not authenticated|forbidden/i.test(error.message) ? 401 : 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Master service error' }));
  }
}
