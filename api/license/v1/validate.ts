import { AuthorityError, bodyOf, cors, reply, validateLicense } from "../../../src/new-api-authority.js";

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204; for (const [k,v] of Object.entries(cors)) res.setHeader(k, String(v)); return res.end();
  }
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405).body?.();
  try {
    const request = new Request(`https://${req.headers.host || "incendiarynetworks.cc"}${req.url || "/api/license/v1/validate"}`, { method: "POST", headers: new Headers(req.headers as Record<string,string>), body: req });
    const data = await validateLicense(await bodyOf(request));
    const response = reply(data, 200);
    res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); const text = await response.text(); return res.end(text);
  } catch (error) {
    const e = error as AuthorityError;
    const response = reply({ error: e.message || "License validation failed", ...(e.code ? { code: e.code } : {}) }, e.status || 500);
    res.statusCode = response.status; response.headers.forEach((v,k)=>res.setHeader(k,v)); return res.end(await response.text());
  }
}
