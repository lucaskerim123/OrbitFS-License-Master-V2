# OrbitFS License API Architecture

The License Master API is the central authority for OrbitFS customer, product, entitlement, licence, installation, activation, enforcement, and release-eligibility state.

## Canonical topology

```text
Customer OrbitFS Products ─────┐
                              │
V2 Billing Store ──────────────┼──> License Master API ──> Supabase/PostgreSQL
                              │
Release / Deployment System ──┘
```

The Billing Store owns storefront, checkout, orders, invoices, customer portal, billing UI, and commercial presentation. It MUST use the License Master API for licence/product/entitlement state and MUST NOT perform direct database writes against License Master tables.

Customer products authenticate to the License Master API to register installations and validate their licence/entitlements. They do not receive database credentials for the License Master database.

The release/deployment system publishes release metadata and deployment state through an authenticated API. The License Master API is authoritative for whether a customer, installation, product, channel, and version are eligible. The Billing Store decides how that eligible release/deployment is presented in its authenticated customer/admin UI.

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

`{SITE_URL}`

Canonical public API base:

`{SITE_URL}/api`

All public and caller-facing License Master endpoints use the canonical `/api/*` contract. No OrbitFS application endpoint uses `/api/v1/*`.

Supabase's own `/auth/v1/*`, `/rest/v1/*` and `/storage/v1/*` service endpoints are external Supabase contracts and remain unchanged.

### Public/runtime

- `GET /api/health`
- `GET /api/license/public-key`
- `POST /api/license/validate`
- `GET /api/license/revision`
- `GET /api/releases`
- `GET /api/releases/latest`

### Billing service

The Billing Store public origin is configured separately as `BILLING_SITE_URL=https://orbitfsstore.vercel.app`. This variable is a site origin only; it is not the License Master API base.

The Billing Store calls the License Master at `{SITE_URL}/api/{endpoint}` using its dedicated `BILLING_API_TOKEN` and is not given the master administrative token.

### Deployment service

The deployment service uses `DEPLOYER_API_TOKEN` for installation and deployment operations and calls `{SITE_URL}/api/{endpoint}`.

### Master administration

`MASTER_API_TOKEN` is reserved for privileged License Master operations and automation. Browser clients should not receive it.
