# OrbitFS release pipeline

License Master owns the release control plane and receives release inputs from the product repositories. The Billing Store does not become the source repository or release authority.

## Base release

```text
lucaskerim123/V1-vercel-base
        -> base-release
        -> License Master Base Deployment Backend
        -> captured/approved Base release
        -> Billing Store Base Deployer frontend/middle
        -> customer deployment
```

The Base Deployment Backend receives the `base-release` produced by `V1-vercel-base`, records the release metadata/artifact and makes the approved release available to the Billing Store deployment interface.

## Existing-installation updates

```text
lucaskerim123/V1-vercel-engine
        -> updates_release
        -> License Master Update Release Backend
        -> captured/approved update release
        -> Billing Store Update Releaser frontend/middle
        -> eligible customer
        -> customer-selected in-place update
```

The Update Release Backend receives `updates_release` from `V1-vercel-engine`, records the release metadata/package and controls release eligibility. Updates target already-installed OrbitFS systems and preserve customer application data.

## Billing Store role

The Billing Store owns the Customer Portal and Admin Portal. Its Base Deployer and Update Releaser interfaces call the License Master API. The Store may perform final commercial/admin fulfilment and visibility checks, but it does not directly mutate Master database state.

## Licence fulfilment

After an order is paid and accepted, the Billing Store calls the License Master issue API. License Master creates the authoritative licence and returns its licence details/ID. The Store attaches that result to the paid order and enables the appropriate customer/admin controls.

## Deployment rule

Publishing a release does not automatically deploy it to customers. Customer Base deployment and existing-installation updates are explicit deployment operations, authorised through License Master and initiated through the appropriate Billing Store interface.
