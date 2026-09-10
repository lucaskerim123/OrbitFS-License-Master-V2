import { json, type Env } from "./types";
import { issue } from "./license";
import { validate } from "./runtime";
import { releases, publishRelease } from "./release";
import { deployment } from "./deploy";

function cors(request: Request) {
  const origin = request.headers.get("origin") || "*";
  return { "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS", "vary": "origin" };
}

export default { async fetch(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status:204, headers:cors(request) });
  try {
    let response: Response;
    if (url.pathname === "/health") response = json({ ok:true, service:"orbitfs-license-master-v2" });
    else if (url.pathname === "/api/v1/license/validate" && request.method === "POST") response = await validate(request, env);
    else if (url.pathname === "/api/v1/license/issue" && request.method === "POST") response = await issue(request, env);
    else if (url.pathname === "/api/v1/releases" && request.method === "GET") response = await releases(request, env);
    else if (url.pathname === "/api/v1/releases" && request.method === "POST") response = await releases(request, env);
    else if (url.pathname.match(/^\/api\/v1\/releases\/[^/]+\/publish$/) && request.method === "POST") response = await publishRelease(request, env, url.pathname.split("/")[4]);
    else if (url.pathname === "/api/v1/deployments" && request.method === "POST") response = await deployment(request, env);
    else response = json({ error:"Not found" }, 404);
    return new Response(response.body, { status:response.status,
      headers:{ "content-type": response.headers.get("content-type") || "application/json", ...cors(request) } });
  } catch (error) {
    return json({ error:"Master service error", detail:String((error as Error)?.message || error) }, 500, cors(request));
  }
} };
