# OrbitFS Base Release Runbook

This runbook is the release gate for the V2 License Master. The License Master is the authority for licences, entitlements, installations, release metadata, release artifacts, signing and release control. The Billing Store is the commercial/customer control plane and must call this API rather than maintaining a second authoritative licence database.

## 1. Required server configuration

Set these values in the License Master deployment. Never expose server-only values to browser/customer code.

- `DATABASE_URL` — production Postgres/Supabase connection string.
- `SUPABASE_URL` — production Master Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only service role key.
- `SUPABASE_ANON_KEY` — publishable key used only for admin sign-in where required.
- `MASTER_API_TOKEN` — server-to-server administrative API token.
- `BILLING_API_TOKEN` — token used by the Billing Store integration.
- `DEPLOYER_API_TOKEN` — token used only by the deployment service boundary.
- `LICENSE_ENTITLEMENT_PRIVATE_KEY_B64` — private entitlement signing key.
- `LICENSE_ENTITLEMENT_PUBLIC_KEY_B64` — matching public key.
- `LICENSE_API_BASE_URL` — canonical public licence API base URL.
- `LICENSE_API_ISSUER` and `LICENSE_API_AUDIENCE` — stable JWT/entitlement identity values.
- `CORS_ORIGINS` — only the production admin/store origins that actually need browser access.
- `ADMIN_EMAILS` or the documented admin app-metadata role — production admin allowlist.

Do not put `MASTER_API_TOKEN`, `BILLING_API_TOKEN`, `DEPLOYER_API_TOKEN`, or the private signing key into a browser bundle, `NEXT_PUBLIC_*` variable, GitHub repository, release artifact, or customer installation.

## 2. Database gate

Apply every production migration in numeric order. Do not manually recreate tables from an old export. Verify that the release/control-plane tables, licence tables, installation tables, deployment tables and release tables exist before publishing Base.

Record the production schema version used by the Base release. A Base package and its required customer database schema must be treated as a matched pair. A release must not silently run against an older incompatible schema.

## 3. Release identity

Every Base release must have:

- component: `orbitfs_base`
- semantic version
- source commit
- schema version
- SHA-256 artifact hash
- artifact size
- file count
- channel: `base` for the initial Base package, `update` for later Base updates
- rollout: `internal`, `beta`, or `public`
- severity: `normal`, `important`, or `critical`
- required flag
- minimum supported version when applicable
- rollback version when applicable
- changelog/customer notes
- project/deployment settings required by the deployment service

Do not publish a release with placeholder version, empty artifact hash, missing source commit, or an unknown schema version.

## 4. Publish flow

1. Build the Base deployment package from the exact commit being released.
2. Generate the release manifest and SHA-256 hash.
3. Create a draft release in License Master for `orbitfs_base`.
4. Upload the artifact through the authenticated release artifact endpoint.
5. Verify the stored artifact hash, size and manifest metadata.
6. Keep the release `draft` until internal validation is complete.
7. Publish only after the production deployment path has been checked.
8. Use release control to pause or withdraw a bad release; do not delete release history.

## 5. Base licence gate

A Base installation must be represented by a License Master installation record and must validate against the customer's `orbitfs_base` entitlement. Billing may display/order/manage the commercial state, but License Master remains the source of truth for whether an installation is entitled to run Base.

## 6. Billing integration gate

The Billing Store must have:

- `MASTER_API_URL`
- `MASTER_API_TOKEN`
- a reachable production Master API
- server-only credentials only
- release/deployment operations routed through the Master API where the API architecture requires Master authority

Billing must never expose the Master token to customer/browser code.

## 7. Pre-release checks

Before marking Base public:

- `/health` is healthy and reports the expected configuration state.
- License validation works for a valid Base licence.
- Invalid/revoked/suspended licences are rejected.
- Installation binding works and cannot be bypassed by changing client fields.
- Release listing returns the expected Base release.
- Release artifact upload verifies its hash.
- Published release is downloadable only through the authenticated release path used by the deployment service.
- Pause/withdraw controls work.
- Billing can read the published Base release.
- A fresh customer deployment can initialise the required customer database schema without using the Store database.
- The deployment service can bind the resulting installation to the correct licence.
- A failed deployment records a useful failure state/event and does not leave the licence falsely marked healthy.

## 8. Release rollback

For a bad release, pause/withdraw it first. Select the previously verified rollback version. Do not rewrite old release metadata to make history appear different. Preserve the release ID, hash and audit history.

## 9. Production rule

The first Base release should be deliberately boring: one verified package, one verified schema version, one clear deployment path, one authoritative licence system and complete auditability. Do not add new deployment providers or experimental automation to the release path until this gate passes.
