# OrbitFS License Master V2

Independent authority for OrbitFS licensing, releases and deployment.

## Boundary
- OrbitFS Website / UIDesign is the commercial control plane.
- This repository is the authoritative licensing and release service.
- The Website calls this service through server-to-server APIs.
- Customer OrbitFS installations call the runtime validation API.
- No Website billing data is stored here unless explicitly passed for licence fulfilment.

## Core domains
1. Licence issuance and entitlement signing.
2. Validation, activation, installation bindings and enforcement.
3. Release metadata, manifests, channels and publish state.
4. Deployment/update jobs and customer installation targets.
5. Service health and audit history.

## Modes
Website fulfilment supports Auto Mode and Manual Mode. Manual Mode is an operational fallback; it never makes the Website the licensing authority.

## Release lifecycle
Draft -> Validate -> Publish -> Admin controls -> Customer availability -> Customer deployment.

Publishing never deploys automatically.

## Security
Secrets are Worker bindings only. Private signing keys never leave the Master service.
