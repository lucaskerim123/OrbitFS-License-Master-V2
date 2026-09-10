# OrbitFS License Master V2

Authoritative backend for OrbitFS licensing, release control and deployment/update jobs.

## Responsibilities
- Create and issue licences for paid Website orders.
- Validate licences and installation bindings.
- Suspend, terminate, activate/unblock and unlock licences.
- Maintain authoritative release records and publish state.
- Queue and track deployment/update jobs.
- Sign runtime entitlements with the Master private signing key.

## Boundary
The OrbitFS Website is the billing/customer platform and is not the licensing authority. It calls this service through server-side APIs. Customers do not directly operate the Master service.

The Website may continue accepting accounts, orders and payments while Master is unavailable. Paid orders remain awaiting licence issuance until Master is available.

## Components
`orbitfs_base`, `orbitfs_mcp`, `orbitfs_apex`, `orbitfs_studio` are entitlement components. MCP/APEX/Studio are Engine components and do not create separate Engine deployments.

## Runtime
Cloudflare Worker + D1. Required secrets/bindings are defined in `wrangler.toml` and environment configuration.
