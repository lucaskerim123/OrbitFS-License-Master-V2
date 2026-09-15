import { AuthorityError, bodyOf, cors, validateLicense } from "../../../src/new-api-authority.js";

const write = (res:any, status:number, value:unknown) => {
  res.statusCode = status;
  for (const [k,v] of Object.entries(cors)) res.setHeader(k, String(v));
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
};

export default async function handler(req:any, res:any) {
  if (req.method === "OPTIONS") { res.statusCode = 204; for (const [k,v] of Object.entries(cors)) res.setHeader(k, String(v)); return res.end(); }
  if (req.method !== "POST") return write(res, 405, { error: "Method not allowed" });
  try {
    const request = new Request(`https://${req.headers.host || "incendiarynetworks.cc"}${req.url || "/api/license/v1/validate"}`, {
      method: "POST",
      headers: new Headers(req.headers as Record<string,string>),
      body: req,
      duplex: "half",
    } as RequestInit);
    const data = await validateLicense(await bodyOf(request));
    return write(res, 200, data);
  } catch (error) {
    const e = error as AuthorityError;
    return write(res, e.status || 500, { error: e.message || "License validation failed", ...(e.code ? { code: e.code } : {}) });
  }
}
