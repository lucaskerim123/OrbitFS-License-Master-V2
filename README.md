# OrbitFS License Master V2

Authoritative backend for OrbitFS licensing, release control and deployment/update jobs.

## Authority boundary
The Website is billing/customer software. Master is the authority for licences, installation bindings, products, entitlements, signed runtime entitlements, releases, artifacts and deployment/update jobs.

Customers can still create accounts, orders and payments while Master is unavailable. Paid orders remain awaiting licence issuance until Master returns. The Billing Store must never create a substitute licence locally.

See [`docs/CONTROL-PLANE.md`](docs/CONTROL-PLANE.md) for the full system boundary and deployment/update model.

## Runtime
- Vercel-compatible Node.js API
- Dedicated Supabase PostgreSQL database
- Dedicated private Supabase Storage bucket for release artifacts
- No Cloudflare runtime dependency

## Production URLs
- License Master site: `https://incendiarynetworks.cc`
- License API base: `https://incendiarynetworks.cc/api`
- Billing Store site: `https://orbitfsstore.vercel.app`

The Billing Store URL is a site origin only. It is not the License Master API base. Service calls use `{SITE_URL}/api/{endpoint}` with the appropriate server-only token.

## Licence API
- `POST /api/license/issue` — idempotent issuance by order reference.
- `POST /api/license/validate` — runtime validation and signed entitlement.
- `GET /api/licenses` — Master/billing administration list.
- `POST /api/license/:id/control` — activate, suspend, terminate, unlock, component and expiry controls.
- `GET /api/license/public-key` — runtime verification key.
- `GET /api/license/revision` — Master authority revision.
- `GET /health` — liveness and dependency diagnostics.
- `GET /ready` — readiness check (database and entitlement signing key).
- `GET /admin` — administrator console (Supabase Auth email/password).

## Product authority
Products are configurable records, not deployment-code constants. The canonical products are:

- `orbitfs_base` — Panel/Base runtime; includes initial Base deployment and updater entitlement.
- `orbitfs_mcp` — shared Engine component.
- `orbitfs_apex` — shared Engine component.
- `orbitfs_studio` — shared Engine component.

Product metadata can define runtime, Engine requirement, installation limits, release channel, features, entitlement defaults, and custom metadata/rules. Future add-ons should be added as product records and release packages rather than creating another licensing authority.

## Release API
Lifecycle is `draft -> validated -> published`, with pause and withdrawal controls.

- `GET/POST /api/releases` — release discovery/creation.
- `POST /api/releases/:id/artifact` — artifact upload with SHA-256 verification.
- `POST /api/releases/:id/validate` — validation gate.
- `POST /api/releases/:id/publish` — publish only after validation.
- `POST /api/releases/:id/control` — pause or withdraw.
- `GET /api/releases/latest` — latest published release and short-lived artifact URL.

Publishing never deploys automatically. A published release becomes eligible for authenticated Billing Store/customer presentation. The customer explicitly chooses **Deploy Update**.

## Deployment/update API
- `POST /api/deployments` — queue an update/deployment for a licensed installation.
- `GET /api/deployments` — deployment queue/history.
- `GET /api/deployments/:id` — job status.
- `POST /api/deployments/execute` — submit/execute a deployment operation through the configured deployment service.
- `POST /api/deployments/sync` — synchronize deployment state.

Normal updates use an in-place strategy. They preserve the customer's existing Vercel project and Supabase data; they are not clean reinstalls. Deployment records retain previous/target versions and provider deployment references so failures can be recovered or rolled back.

## Base Deployer vs Updater
Base Deployer is a **Billing Store page** that performs the initial OrbitFS Base installation into a customer's Vercel/Supabase environment. It is not the ongoing update system.

Updater is the release/deployment mechanism used after installation. It updates Base/Panel, MCP, APEX, Studio, and future add-ons while preserving the existing installation. MCP/APEX/Studio use the shared Engine; they do not create separate Engine deployments.

## Components
`orbitfs_base`, `orbitfs_mcp`, `orbitfs_apex`, `orbitfs_studio` are entitlement components. Base runs as the Panel; MCP/APEX/Studio use the existing Engine.

## Failure/degraded operation
License Master is a hard dependency for licensing operations. If it is offline, the Billing Store may continue independent orders, invoices, and payment processing, but it cannot issue or enforce licences.

Licensing-dependent operations remain pending until Master returns:
- create/issue licence
- generate/reissue/rotate key
- activation/validation
- installation unlock/authorisation
