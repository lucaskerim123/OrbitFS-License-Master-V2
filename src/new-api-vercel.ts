export function options(req: any, res: any) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,authorization,x-orbitfs-order-ref,x-actor-ref');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function writeJson(res: any, status: number, value: unknown) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,authorization,x-orbitfs-order-ref,x-actor-ref');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('cache-control', 'no-store');
  return res.status(status).json(value);
}
