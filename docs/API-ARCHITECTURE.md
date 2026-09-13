# OrbitFS License API Architecture

The License Master API is the central authority for OrbitFS customer, product, entitlement, licence, installation, activation, enforcement, and release-eligibility state.

## Canonical topology

```text
Customer OrbitFS Products ─────┐
                              │
V2 Billing Store ──────────────┼──> OrbitFS License API ──> Supabase/PostgreSQL
                              │
Release / Deployment System ──┘
```

The Billing Store owns storefront, checkout, orders, invoices, customer portal, billing UI, and commercial presentation. It MUST use the License API for licence/product/entitlement state and MUST NOT perform direct database writes against License Master tables.

Customer products authenticate to the License API to register installations and validate their licence/entitlements. They do not receive database credentials for the License Master database.

The release/deployment system publishes release metadata and deployment state through an authenticated API. The License API is authoritative for whether a customer, installation, product, channel, and version are eligible. The Billing Store decides how that eligible release/deployment is presented in its authenticated customer/admin UI.

## Authority boundaries

### License Master API owns

- Customers and customer references used by licensing
- Product definitions and product components
- Entitlements and entitlement rules
- Licence records and licence keys
- Installation registration and installation limits
- Activation and validation
- Suspension, termination, blocking, and enforcement state
- Release eligibility and update policy
- Release channels and compatible product/version rules
- API clients and service authentication
- Audit records for licensing operations

### V2 Billing Store owns

- Public storefront
- Product merchandising and checkout
- Orders and invoices
- Payment providers
- Customer portal UI
- Billing/customer support UI
- Commercial visibility and presentation

The Store may cache API responses for UI performance, but License Master remains authoritative for licence state.

### Release/deployment system owns

- Build/package creation
- Deployment jobs
- Deployment provider integration
- Deployment execution state and logs
- Release publication workflow

It asks License Master whether a customer/installation is entitled to a release before serving or deploying it.

## API groups

Canonical production License Master site:

`https://incendiarynetworks.cc`

Canonical public API base:

`https://incendiarynetworks.cc/api`

All public/caller-facing API endpoints use `/api/*`. The legacy `/api/v1/*` implementation may remain internal for compatibility, but clients MUST use the canonical `/api/*` contract.

### Public/runtime

- `GET /api/license/health`
- `POST /api/license/register`
- `POST /api/license/activate`
- `POST /api/license/validate`
- `GET /api/license/revision`
- `GET /api/releases`
- `GET /api/releases/:releaseId`

Runtime endpoints return only the information required by the authenticated customer installation. License keys are never returned after initial issuance except through an explicitly authorised delivery operation.

### Billing service

The Billing Store public origin is configured separately as `BILLING_SITE_URL=https://orbitfsstore.vercel.app`. This variable is a site origin only; it is not an API base.

Authenticated service-to-service access for the Billing Store:

- customer lookup/synchronisation
- product catalogue
- entitlement lookup
- licence issuance/reissue
- licence status changes
- installation lookup
- release eligibility

The Billing Store calls the License API at `{SITE_URL}/api/{endpoint}` using its dedicated `BILLING_API_TOKEN` and is not given the master administrative token.

### Deployment service

Authenticated service-to-service access for release/deployment automation:

- publish release metadata
- check release eligibility
- register/update deployment state
- report deployment health
- request installation/release operations

The deployment service uses `DEPLOYER_API_TOKEN` and cannot perform unrelated master administration.

### Master administration

`MASTER_API_TOKEN` is reserved for privileged License Master operations and automation. Browser clients should not receive it.

## Product model

Products are data, not hard-coded application branches. Each product can define:

- `code`, name, slug, description
- active/public/purchasable state
- runtime (`panel`, `engine`, or other future runtime)
- whether an Engine is required
- installation limit
- licence duration/expiry/grace policy
