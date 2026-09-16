import type { IncomingMessage, ServerResponse } from 'node:http';
import { handler } from '../src/server.js';

export default async function api(req: IncomingMessage, res: ServerResponse) {
  try {
    return handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Master service error' }));
  }
}
