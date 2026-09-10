import type { Env } from "./types";

export function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export function isMaster(request: Request, env: Env) {
  return bearer(request) !== "" && bearer(request) === env.MASTER_API_TOKEN;
}

export function isBilling(request: Request, env: Env) {
  return bearer(request) !== "" && bearer(request) === env.BILLING_API_TOKEN;
}

export function isDeployer(request: Request, env: Env) {
  return bearer(request) !== "" && bearer(request) === env.DEPLOYER_API_TOKEN;
}

export function requireRole(request: Request, env: Env, roles: Array<"master" | "billing" | "deployer">) {
  if (roles.includes("master") && isMaster(request, env)) return "master";
  if (roles.includes("billing") && isBilling(request, env)) return "billing";
  if (roles.includes("deployer") && isDeployer(request, env)) return "deployer";
  return null;
}
