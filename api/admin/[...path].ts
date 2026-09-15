import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAdminConsole } from '../../src/admin-console.js';

export default async function adminApi(req: IncomingMessage, res: ServerResponse) {
  const host = String(req.headers.host || 'www.incendiarynetworks.cc');
  const requestUrl = `https://${host}${req.url || '/api/admin'}`;
  try {
    const url = new URL(requestUrl);
    const request = new Request(requestUrl, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: ['GET', 'HEAD'].includes(String(req.method)) ? undefined : req,
      duplex: 'half'
    } as RequestInit);
    const response = await handleAdminConsole(request, url.pathname);
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
    const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status?: number }).status) || 500 : 500;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Master service error' }));
  }
}
