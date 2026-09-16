# OrbitFS Two-System Architecture

## System 1 — License Master / Release / Deploy

System 1 is the authority. It owns the licensing state and the release/deployment control plane.

```text
                         SYSTEM 1
        ┌─────────────────────────────────────┐
        │ OrbitFS License Master              │
        │                                     │
        │ License authority                   │
        │ License issue / validate / enforce  │
        │ Products and entitlements           │
        │ Release system                      │
        │ Base deploy system                  │
        │ Installation state                  │
        │ Audit / authority settings          │
        └───────────────┬─────────────────────┘
                        │
                 internal services
                        │
                 Supabase/PostgreSQL

        External boundary only:
                        │
                        ▼
              /api/* License Master API
                        ▲
                        │
             System 2 / customer systems
```

### The License Master panel

The administrator panel is part of System 1. It does **not** call the public License Master API to perform its own work.

```text
Admin browser
    │
    ▼
/admin panel controller
    │
    ▼
License Master internal services
    │
    ▼
License Master DB
```

There is no panel → `/api/*` → panel-service loop and no panel use of `MASTER_API_TOKEN` for normal administration.

The panel's internal operations include:

- listing and controlling licences
- issuing licences manually
- managing products
- reading authority settings
- creating/validating/publishing/pausing/withdrawing releases
- viewing installations
- viewing deployment jobs

The API is only the external doorway into System 1.

## System 2 — Billing Storefront

System 2 owns commerce and customer-facing billing functionality.

```text
Customer
   │
   ▼
V2 Billing Store
   │
   │ checkout / orders / invoices / customer account
   │
   └──── authenticated request ────> System 1 API
                                      │
                                      ▼
                              License Master service
                                      │
                                      ▼
                                    DB
                                      │
                                      ▼
                              license key / result
                                      │
                                      ▼
                                Billing Store
```

System 2 owns:

- storefront and product presentation
- checkout
- orders
- invoices
- payment providers
- customer accounts and portal
- commercial/billing UI

System 2 does **not** write directly to License Master licensing tables.

## License issuance flow

Example: a customer buys an OrbitFS Base licence in System 2.

1. System 2 records the order/payment.
2. System 2 sends a licence-issuance request to System 1's `/api/*` boundary using `BILLING_API_TOKEN`.
3. System 1's API authenticates the Billing Store.
4. The API invokes the internal License Master licensing service.
5. The licensing service creates the licence directly in the License Master database.
6. System 1 returns the generated licence key and authoritative licence state to System 2.
7. System 2 stores/displays the returned customer-facing result.

If System 1 is unavailable, System 2 may retain the paid order as awaiting issuance; it must not manufacture a License Master licence itself.

## Release flow

Releases are controlled by System 1 and remain manually operated.

```text
V1-vercel-base / V1-vercel-engine
                │
                ▼
        System 1 Release System
                │
       draft → validate → publish
                │
                ▼
       manual handoff to System 2
```

System 1 owns release metadata, eligibility and deployment control. System 2 receives the published release information for customer/storefront presentation and customer-side update workflows.

## External API boundary

The public API exists for callers outside System 1, including:

- V2 Billing Store
- customer OrbitFS runtimes
- deployment/client systems
- other authorised OrbitFS services

The public API is **not** the internal transport layer for the License Master panel.

`MASTER_API_TOKEN`, `BILLING_API_TOKEN`, and `DEPLOYER_API_TOKEN` are service credentials for external service-to-service calls. Browser administration must not require the master service token.

Supabase/PostgreSQL remains the database layer. It is not the business-system boundary between System 1 and its own panel.
