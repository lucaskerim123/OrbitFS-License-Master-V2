# OrbitFS License Master — Control Plane

## Purpose

OrbitFS License Master is the central licensing authority for OrbitFS. It is the service that decides whether a customer, product, installation, component, release, or update is authorised. It runs at `https://incendiarynetworks.cc` and uses its own Supabase/PostgreSQL database.

The V2 Billing Store is a separate application. It owns storefront, checkout, orders, invoices, customer accounts, customer/admin UI, and commercial state. It must not become a second licensing authority or directly mutate License Master tables.

## System boundary

```text
Customer OrbitFS installations
          |
          | License API
          v
+--------------------------------+
|       ORBITFS LICENSE MASTER   |
|       incendiarynetworks.cc    |
|                                |
| Auth / service credentials     |
| Customers / product authority  |
| Products / entitlements        |
| Licences / keys                |
| Installation bindings          |
| Activation / validation        |
| Suspension / termination       |
| Release catalogue              |
| Release eligibility            |
| Deployment/update jobs         |
| Audit / authority revision     |
+---------------+----------------+
                |
                v
          Supabase/PostgreSQL

V2 Billing Store ----------------------+
 |                                     |
 | Storefront / checkout               |
 | Orders / invoices                   |
 | Customer portal                     |
 | Admin UI                            |
 | Base Deployer page                  |
 | License Controller page             |
 | Release/update presentation         |
 +---------- License API --------------+

Release System ----------------------- License Master
 |                                      |
 | package/draft/changelog              |
 |                                      v
 |                               release metadata
 +------------------------------> eligibility

Customer update flow:

Release System -> License Master -> Billing Store admin review
                                  -> customer sees update
                                  -> customer chooses Deploy Update
                                  -> Billing Store deployment service
                                  -> existing customer Vercel project
                                  -> existing customer Supabase database
```

## Billing Store pages

### Base Deployer

Base Deployer is a Billing Store page, not a License Master UI page. It uses the License API to confirm the customer owns `orbitfs_base`, then provisions the customer's initial OrbitFS Base installation into the customer's Vercel/Supabase environment.

The Base Deployer is responsible for the initial installation only. It does not become the general update mechanism.

### License Controller

License Controller is also a Billing Store page over the License API.

Customers can perform permitted actions such as viewing their licence, rotating a key, viewing installations, and unlocking an installation where policy allows it. Administrators receive the full enforcement controls: activate, suspend, deactivate, terminate, unlock, rotate/reissue keys, change installation limits, and other authority operations exposed by License Master.

## Updates

Updates are customer-triggered, not an automatic background replacement.

1. License Master release tooling creates/packages a release and records its metadata, checksum, compatibility, channel, and update strategy.
2. The release is sent to the Billing Store for authenticated admin review.
3. Billing Store admins perform final checks and release it to customers.
4. Eligible customers see an update in their customer portal.
5. The customer chooses **Deploy Update**.
6. The update is deployed to the customer's existing installation.
7. The updater preserves the customer's existing Supabase data and Vercel project. A normal update is `in_place`; it is not a clean reinstall.
8. Deployment records the previous version, target version, provider deployment ID, health result, and rollback information.

The updater covers the complete OrbitFS product family: Base/Panel, MCP, APEX, Studio, and future add-ons. MCP/APEX/Studio continue to use the existing shared Engine rather than creating separate Engine deployments.

## Product model

Products are data-driven rather than hard-coded into deployment logic. Current canonical products are:

- `orbitfs_base` — `runtime=panel`
- `orbitfs_mcp` — `runtime=engine`
- `orbitfs_apex` — `runtime=engine`
- `orbitfs_studio` — `runtime=engine`

A product can declare its runtime, whether an Engine is required, installation limits, release channel, features, entitlement defaults, metadata, and additional entitlement rules. Future add-ons should be added as product records rather than requiring a new core deployment architecture.

## Failure/degraded operation

License Master is a hard dependency for licensing operations.

If License Master is unavailable, the Billing Store may continue to handle independent commercial operations such as orders, invoicing, and payment processing. It must not fabricate or locally issue licences.

Licensing operations remain pending until License Master returns:

- licence creation/issuance
- key generation/reissue/rotation
- activation/validation
- installation authorisation/unlock
- suspension/termination/enforcement
- entitlement checks
- release eligibility

For example, a paid order may remain `PAID` while its fulfilment is `PENDING_LICENSE_ISSUANCE`. Once License Master returns, the Store retries the authority operation and completes fulfilment.

## Data ownership

**License Master database:** licences, keys, entitlement state, installation bindings, products, release metadata, deployment/update jobs, and licensing audit.

**Billing Store database:** customers/accounts, carts, orders, invoices, payment state, Store UI state, support, and Store-side deployment credentials/references.

**Customer Supabase:** OrbitFS operational data. License Master and Billing Store do not become the customer's application database.

Deployment credentials must never be stored as ordinary licence metadata. Provider OAuth/tokens belong in the deployment system's secure credential storage. License Master stores provider/project references and deployment state, not customer secrets.

## Vercel deployment model

Vercel supports programmatic project/deployment management through its REST API. The deployment service can create deployments, manage project configuration/environment variables, and inspect deployment status. See the official Vercel API documentation before implementing a provider adapter.

The provider adapter should receive a short-lived/securely retrieved customer authorization and operate only on the customer's selected project/team. It must never require access to OrbitFS's private source repositories.

## Supabase migration model

Customer Base provisioning and updates must use versioned, reproducible migrations. A release can carry schema/migration metadata and `migration_required` state. The updater applies only pending migrations, records the migration/release result, and never drops or replaces customer data as part of a normal update.

Supabase's supported migration workflow is to keep migrations in version control and deploy them with the Supabase CLI; remote schema changes should not bypass migration history.

## Authority rule

The single rule to preserve throughout the system is:

> Billing Store presents and orchestrates. Customer systems execute. License Master decides licensing authority.
