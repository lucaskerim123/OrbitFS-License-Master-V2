import type { IncomingMessage, ServerResponse } from 'node:http';
import { handler } from '../src/server.js';
import { handleAdminConsole } from '../src/admin-console.js';

export default async function api(req: IncomingMessage, res: ServerResponse) {
  const host = String(req.headers.host || 'www.incendiarynetworks.cc');
  const url = `https://${host}${req.url || '/api'}`;
  try {
    const request = new Request(url, { method: req.method, headers: new Headers(req.headers as Record<string, string>), body: ['GET','HEAD'].includes(String(req.method)) ? undefined : req, duplex: 'half' } as RequestInit);
    const pathname = new URL(url).pathname;
    if (pathname.startsWith('/api/admin/')) {
      const response = await handleAdminConsole(request, pathname);
      if (response) {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
    }
    return handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Master service error' }));
  }
}
