import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAdminConsole } from '../src/admin-console.js';

export default async function adminApi(req: IncomingMessage, res: ServerResponse) {
  const host = String(req.headers.host || 'www.incendiarynetworks.cc');
  const url = `https://${host}${req.url || '/admin-api'}`;
  try {
    const request = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers as Record<string, string>),
      body: ['GET', 'HEAD'].includes(String(req.method)) ? undefined : req,
      duplex: 'half',
    } as RequestInit);
    const pathname = new URL(url).pathname;
    const response = await handleAdminConsole(request, pathname);
    if (!response) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Admin route not found' }));
      return;
    }
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'License Master admin service error' }));
  }
}
