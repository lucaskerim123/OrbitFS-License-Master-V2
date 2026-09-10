# OrbitFS License Master V2

Authoritative backend for OrbitFS licensing, release control and deployment/update jobs.

## Authority boundary
The Website is billing/customer software. Master is the authority for licences, installation bindings, signed runtime entitlements, releases, artifacts and deployment jobs.

Customers can still create accounts, orders and payments while Master is unavailable. Paid orders remain awaiting licence issuance until Master returns.

## Runtime
- Vercel-compatible Node.js API
- Dedicated Supabase PostgreSQL database
- Dedicated private Supabase Storage bucket for release artifacts
- No Cloudflare runtime dependency

## Licence API
- `POST /api/v1/license/issue` — idempotent issuance by order reference.
- `POST /api/v1/license/validate` — runtime validation and signed entitlement.
- `GET /api/v1/licenses` — Master/billing administration list.
- `POST /api/v1/license/:id/control` — activate, suspend, terminate, unlock, component and expiry controls.
- `GET /api/v1/license/public-key` — runtime verification key.
- `GET /api/v1/license/revision` — Master authority revision.

## Release API
Lifecycle is `draft -> validated -> published`, with pause and withdrawal controls.

- `GET/POST /api/v1/releases` — release discovery/creation.
- `POST /api/v1/releases/:id/artifact` — artifact upload with SHA-256 verification.
- `POST /api/v1/releases/:id/validate` — validation gate.
- `POST /api/v1/releases/:id/publish` — publish only after validation.
- `POST /api/v1/releases/:id/control` — pause or withdraw.
- `GET /api/v1/releases/latest` — latest published release and short-lived artifact URL.

Publishing never deploys automatically.

## Deployment API
- `POST /api/v1/deployments` — queue a deployment for a licensed installation.
- `GET /api/v1/deployments` — deployment queue/history.
- `GET /api/v1/deployments/:id` — job status.

## Components
`orbitfs_base`, `orbitfs_mcp`, `orbitfs_apex`, `orbitfs_studio` are entitlement components. MCP/APEX/Studio use the existing Engine and do not create separate Engine deployments.

## Required environment
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MASTER_API_TOKEN`
- `BILLING_API_TOKEN`
- `DEPLOYER_API_TOKEN`
- `LICENSE_ENTITLEMENT_PRIVATE_KEY_B64`
