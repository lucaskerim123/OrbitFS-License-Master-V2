# OrbitFS License Master — Control Plane

## Purpose

OrbitFS License Master is the standalone licensing, entitlement, release, installation and deployment authority for OrbitFS. It owns the authoritative licence state and exposes the API consumed by the Billing Store and customer runtime/deployment systems.

The V2 Billing Store is the OrbitFS commercial application. It owns the Customer Portal, Admin Portal, customers, products, orders, invoices, payments and fulfilment. It calls License Master through the authenticated API and never writes directly to Master tables.

## System layout

```text
V2_Billing_Store
  Customer Portal
    - Base Deployer frontend
    - Update Releaser frontend
    - licence/account/download/support views
  Admin Portal
    - Base Deployer frontend/middle
    - Update Releaser frontend/middle
    - customer/order/fulfilment controls
            |
            | authenticated License Master API
            v
+------------------------------------------------+
|              ORBITFS LICENSE MASTER            |
|                                                |
| licence issuance / validation / enforcement    |
| products / entitlements / bindings             |
| release catalogue and eligibility               |
| Base Deployer backend                           |
| Update Release backend                          |
| deployment/update jobs                          |
| audit / authority state                          |
+----------------------+-------------------------+
                       |
                       v
                 Supabase/PostgreSQL

Release inputs:

V1-vercel-base  -- base-release --> Base Deployment Backend
V1-vercel-engine -- updates_release --> Update Release Backend

Deployment targets:

Base Deployer -> customer's Vercel/Supabase installation
Update Releaser -> customer's existing Vercel/Supabase installation
```

## Licence issuance

A paid/accepted order in the Billing Store triggers licence issuance through the License Master API:

`paid order -> Store fulfilment -> Master issue API -> authoritative licence created -> licence details returned -> Store attaches licence to order/customer -> deployment/update controls enabled`

If Master is unavailable, the Store can continue independent commercial operations but licence fulfilment remains pending. The Store must retry the Master API rather than creating a local substitute licence authority.

## Base Deployer backend

The Base Deployer backend belongs to License Master. It receives the `base-release` produced by `lucaskerim123/V1-vercel-base`, records the approved release/artifact and controls the resulting Base deployment job. The Billing Store supplies the customer-facing Base Deployer frontend/middle layer and calls the backend through the Master API.

The Base deployment is the initial installation path. Customer deployments use customer-authorised provider credentials and never require exposing OrbitFS source repositories to the customer.

## Update Release backend

The Update Release backend belongs to License Master. It receives `updates_release` from `lucaskerim123/V1-vercel-engine`, records release metadata/package and determines release eligibility. The Billing Store supplies the customer-facing Update Releaser frontend/middle layer.

An eligible customer explicitly chooses **Deploy Update**. The update targets the existing installation in place and preserves customer Vercel/Supabase data.

## API boundaries

Billing Store may call Master for:

- licence issue/reissue/rotation and control
- licence validation and entitlement checks
- product/release catalogue
- release eligibility
- Base deployment jobs
- update deployment jobs
- deployment status/synchronisation

Product repositories publish release inputs to the dedicated Master release backends. They do not write to Master database tables directly.

## Data ownership

**License Master:** licences, keys, entitlement state, bindings, products, release metadata, deployment/update jobs and licensing audit.

**Billing Store:** customers/accounts, carts, orders, invoices, payments, commercial fulfilment state, portal/admin UI state and Store-side customer provider references.

**Customer Supabase:** OrbitFS operational/application data.

Provider secrets remain in secure deployment credential storage and are never stored as ordinary licence metadata or exposed to browser bundles.

## Authority rule

**Billing Store presents, sells, fulfils and orchestrates. License Master issues and validates licences and controls release/deployment authority. Customer systems execute the resulting deployment or update.**
