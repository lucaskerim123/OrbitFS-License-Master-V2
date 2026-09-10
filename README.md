# OrbitFS License Master V2

Authoritative backend for OrbitFS licensing, release control and deployment/update jobs.

## Authority boundary
The Website is billing/customer software. Master is the authority for licences, installation bindings, signed runtime entitlements, releases, artifacts and deployment jobs.

Customers can still create accounts, orders and payments while Master is unavailable. Paid orders remain awaiting licence issuance until Master returns.

## Licence API
- `POST /api/v1/license/issue` — idempotent issuance by order reference.
- `POST /api/v1/license/validate` — runtime validation and signed entitlement.
- `GET /api/v1/licenses` — Master administration list.
- `GET /api/v1/license/:id` — licence details.
- `POST /api/v1/license/:id/control` — activate, suspend, terminate, unlock, component and expiry controls.
- `POST /api/v1/license/:id/heartbeat` — installation heartbeat.
- `GET /api/v1/installations` — installation inventory.
- `GET /api/v1/license/public-key` — runtime verification key.

## Release API
Lifecycle is `draft -> validated -> published`, with `paused`, `withdrawn` and `superseded` controls.

- `GET/POST /api/v1/releases` — published discovery or Master release creation.
- `POST /api/v1/releases/:id/artifact` — artifact upload with SHA-256 verification.
- `POST /api/v1/releases/:id/validate` — manifest/artifact validation gate.
- `POST /api/v1/releases/:id/publish` — publish only after validation.
- `POST /api/v1/releases/:id/control` — pause, withdraw or restore to draft.
- `GET /api/v1/releases/:id/artifact` — published artifact delivery.

Publishing never deploys automatically.

## Deployment API
- `POST /api/v1/deployments` — queue an update for a licensed installation.
- `GET /api/v1/deployments` — deployment queue/history.
- `GET /api/v1/deployments/:id` — job status.
- `PATCH /api/v1/deployments/:id` — deployer progress/result callback.
- `DELETE /api/v1/deployments/:id` — cancel queued/running deployment.

The deployment service validates the licence, component, installation binding and published release before queuing a job.

## Components
`orbitfs_base`, `orbitfs_mcp`, `orbitfs_apex`, `orbitfs_studio` are entitlement components. MCP/APEX/Studio use the existing Engine and do not create separate Engine deployments.

## Infrastructure
Cloudflare Worker + D1 + R2. The D1 database is provisioned as `orbitfs-license-master-v2`. R2 must be enabled on the Cloudflare account before the release artifact bucket can be created.

Required secrets:
- `MASTER_API_TOKEN`
- `BILLING_API_TOKEN`
- `DEPLOYER_API_TOKEN`
- `ENTITLEMENT_PRIVATE_KEY_B64`

Environment variables and bindings are defined in `wrangler.toml`.
