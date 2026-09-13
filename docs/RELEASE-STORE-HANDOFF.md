# OrbitFS Release / Base Deployment Authority

## Ownership

**OrbitFS License Master V2** owns the technical work: license authority and master license control; release creation, source capture, SemVer validation, packaging, artifact integrity and release history; Base deployment preparation/execution and deployment state; and final release/deployment draft preparation.

**V2_Billing_Store** owns customers, accounts, orders, payments, subscriptions, support, customer-facing publication, and the My OrbitFS presentation layer. My OrbitFS exposes the License Controller, Base Deployer and Update/Release frontend but does not become a second licensing or release authority.

## Release state machine

```text
draft
  ↓
validated
  ↓
ready_for_store
  ↓
published
```

`ready_for_store` is the hard authority boundary. Master has completed the technical work and hands the final draft to the Billing Store. The Store is responsible for deciding when the customer-facing release becomes published.

A Master release cannot become customer-visible simply because its build succeeded.

## Base deployment

```text
V1-vercel-base
      ↓
License Master Release System
      ↓
build / package / validate
      ↓
Base deployment preparation
      ↓
final draft
      ↓
V2_Billing_Store
      ↓
customer publication
      ↓
My OrbitFS → Deploy Base
      ↓
License Master Base Deployer
```

The customer-facing Base Deployer is therefore a Store/My OrbitFS interface over Master authority. Master performs the actual deployment work and records deployment state.

## Update releases

```text
V1-vercel-engine
      ↓
License Master Release System
      ↓
build / package / validate
      ↓
final update draft
      ↓
V2_Billing_Store
      ↓
customer publication
      ↓
My OrbitFS → Deploy Update
      ↓
License Master Base/Update Deployer
```

Normal updates remain in-place and preserve the customer's existing Vercel project and Supabase data.

## Automation

Automation is **off by default**. The controls are:

- `release_automation_enabled`
- `auto_finalize_base`
- `auto_finalize_updates`

All default to `false`. Automation may perform the technical release work and the Master-to-Store handoff only when explicitly enabled. It never bypasses the Store publication boundary.

## Master → Store handoff

Set these server-only variables in License Master:

```text
BILLING_STORE_API_URL=https://<billing-store-host>
BILLING_STORE_API_TOKEN=<server-only-token>
BILLING_STORE_RELEASE_DRAFT_PATH=/api/internal/master/release-drafts
```

Master sends a `release.draft.ready` event to the Store. The payload contains the release ID, component, version, source commit, release notes, compatibility, artifact hash/size/path and an authenticated Master artifact-download endpoint. It does not contain customer secrets or database credentials.

If the Store is unavailable, Master keeps the release at `ready_for_store` and records the delivery as `failed`/`pending`. It does not publish as a fallback.

## API

`POST /api/release-handoff?action=finalize&id=<releaseId>` — Master only. Finalizes a validated release and attempts the Store handoff.

`POST /api/release-handoff?action=auto-finalize&id=<releaseId>` — Master only. Same operation, but Master first checks the automation switches.

`GET /api/release-handoff?action=drafts` — Master or Billing Store. Lists final drafts awaiting customer publication.

`POST /api/release-handoff?action=publish&id=<releaseId>` — Billing Store only. Makes the final draft customer-visible.

`POST /api/release-handoff?action=retry&id=<releaseId>` — Master only. Retries a failed Store handoff.

`GET /api/release-handoff?action=artifact-url&id=<releaseId>` — authenticated Master/Billing short-lived artifact URL.

`GET/PATCH /api/release-automation-settings` — administrator automation controls. Defaults remain disabled.

## GitHub Actions

The License Master workflow uses GitHub Actions as execution infrastructure, not as an authority. It performs the SemVer gate, creates GitHub deployment records, builds/packages the source release, uploads the artifact into License Master, validates it, and optionally performs the Master-to-Store handoff.

Automatic GitHub Release/Release Drafter tooling is deliberately not the customer publication authority. A GitHub Release may be used as a technical source record, but it must not replace the Master → Billing Store → customer publication boundary.
