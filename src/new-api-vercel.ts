import { cors } from "./new-api-authority.js";

export const writeJson = (res:any, status:number, value:unknown) => {
  res.statusCode = status;
  for (const [k,v] of Object.entries(cors)) res.setHeader(k, String(v));
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
};

export const writeText = (res:any, status:number, value:string, type="text/plain; charset=utf-8") => {
  res.statusCode = status;
  for (const [k,v] of Object.entries(cors)) res.setHeader(k, String(v));
  res.setHeader("content-type", type);
  res.end(value);
};

export const options = (req:any, res:any) => {
  if (req.method !== "OPTIONS") return false;
  res.statusCode = 204;
  for (const [k,v] of Object.entries(cors)) res.setHeader(k, String(v));
  res.end();
  return true;
};

export const requestFromNode = (req:any) => new Request(`https://${req.headers.host || "incendiarynetworks.cc"}${req.url || "/"}`, {
  method: req.method,
  headers: new Headers(req.headers as Record<string,string>),
  body: ["GET","HEAD"].includes(req.method) ? undefined : req,
  duplex: "half",
} as RequestInit);
