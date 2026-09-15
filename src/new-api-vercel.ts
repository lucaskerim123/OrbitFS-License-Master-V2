import type { IncomingMessage, ServerResponse } from "node:http";

export const options = (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "OPTIONS") return false;
  res.statusCode = 204;
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type,authorization,x-orbitfs-order-ref,x-actor-ref");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("cache-control", "no-store");
  res.end();
  return true;
};

export const writeJson = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type,authorization,x-orbitfs-order-ref,x-actor-ref");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};
