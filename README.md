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
- `GET /health` — liveness and dependency diagnostics.
- `GET /ready` — readiness check (database and entitlement signing key).
- `GET /admin` — small administrator console (Supabase Auth email/password).

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
- `SUPABASE_ANON_KEY` (publishable key used only by the sign-in page)
- `ADMIN_EMAILS` (comma-separated allowlist; alternatively set `app_metadata.role=admin`)

`SUPABASE_SERVICE_ROLE_KEY`, all Master/Billing/Deployer tokens, and the entitlement
private key are server-only values. The admin page receives only the Supabase URL
and publishable key, and the API verifies the Supabase access token server-side
before every administrator operation. Apply `migrations/0001_core.sql` to a fresh
Supabase PostgreSQL database; migration files `0002`–`0006` are compatibility
no-ops because the former files used invalid SQLite syntax and incomplete tables.

For Vercel Hobby, keep request work bounded: the included configuration uses the
10-second function limit. Artifact uploads should be performed by the release
pipeline, and deployment execution should be treated as a short-lived submission
operation rather than a background worker.

## Low-noise deployment workflow

Link the Vercel project to this repository with `main` as its production branch.
For a free-tier operation, disable automatic preview deployments for incidental
branches in the Vercel Git settings and use pull requests for review builds.
Production should be promoted only after the pull request is merged to `main`.

The repository's Vercel `ignoreCommand` skips builds for README-only, issue/
workflow-only, and other metadata-only commits while failing open when Git
metadata is unavailable. Batch related licensing, migration, and deployment
changes into one pull request before pushing; this reduces duplicate preview
builds while keeping source and schema changes deployable. GitHub Actions uses
the same path filter and cancels superseded runs, so a branch push does not
create a second long-running check for the same change.

## First-time setup

1. Create a Supabase project and run `migrations/0001_core.sql` through `0006_master_hardening.sql` in the Supabase SQL editor.
2. Enable Supabase email/password sign-in. When `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are configured, open `/admin` and use **First-time setup** to create the first administrator; the account receives `app_metadata.role=admin` and is signed in automatically. Alternatively, create an administrator in Supabase Authentication with an email listed in `ADMIN_EMAILS`.
3. In Vercel, add the variables from `.env.example` to the **Production** environment. Put the pooler `DATABASE_URL`, Supabase URL/keys, three server API tokens, `ADMIN_EMAILS`, and the base64 entitlement private key there. Redeploy after saving variables.
4. Open `/health`, then `/ready`. Health should be HTTP 200 and reports database, signing, API-token, and admin-auth configuration without exposing secrets. Readiness becomes HTTP 200 only after the database, signing key, and all three Master API tokens are available.
5. Open `/admin`, sign in with the Supabase administrator account, and use the configuration status table before managing licenses.

The admin panel can inspect service status and manage licenses, but it intentionally cannot edit API secrets. Configure those only in Vercel Environment Variables so database credentials, bearer tokens, and the entitlement private key never reach browser storage or page JavaScript. The public entitlement key is available at `/api/v1/license/public-key`.
