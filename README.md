# OrbitFS License Master V2

The License Master is the authoritative licensing, entitlement, release, installation and deployment control plane for the OrbitFS commercial platform.

## Canonical production services

- License Master: `https://incendiarynetworks.cc`
- License Master API: `https://incendiarynetworks.cc/api`
- Billing Store: `https://orbitfsstore.vercel.app`

## Public API contract

The public License Master API uses `/api/*`. There is no OrbitFS `/api/v1/*` application API.

Supabase's own `/auth/v1/*`, `/rest/v1/*` and `/storage/v1/*` service endpoints are external Supabase contracts and remain unchanged.

## Release sources

- Base deployment releases: `lucaskerim123/V1-vercel-base` / `base-release`
- Existing-installation update releases: `lucaskerim123/V1-vercel-engine` / `release-updates`

The release source repository names are historical repository names; they are not an API versioning scheme.

## Service credentials

- `MASTER_API_TOKEN` — privileged Master automation
- `BILLING_API_TOKEN` — Billing Store service access
- `DEPLOYER_API_TOKEN` — deployment/update service access

All private credentials remain server-side.
