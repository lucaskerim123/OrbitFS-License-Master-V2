# OrbitFS release source architecture

License Master is the authority for release metadata, version records, licence eligibility and deployment/update state. It does not invent or replace the source repositories.

## Base deployment release source

Repository: `lucaskerim123/V1-vercel-base`

Branch: `base-release`

The Base/Panel deployment release source is the `base-release` branch in the V1 Base repository. License Master captures the exact Base version/source commit used for a release and retains that source reference with the immutable release record. A later Base release can be compared against the previously captured source version/commit so the release record shows what changed.

## Update release source

Repository: `lucaskerim123/V1-vercel-engine`

Branch: `release-updates`

The Engine/add-on update release system uses the `release-updates` branch for existing-installation updates for MCP, APEX and Studio. The old `UPDATE_RELEASE` name is not used by License Master release discovery.

## Authority flow

```text
V1-vercel-base / base-release
        -> capture latest Base version + source commit
        -> compare later Base source changes
        -> immutable Base release record
        -> Base deployment system

V1-vercel-engine / release-updates
        -> capture latest Engine/update source commit
        -> build existing-installation update candidate
        -> exact version + source commit + component set
        -> License Master / Store release handling

License Master
        -> release metadata / checksum / eligibility / licence authority

Billing Store
        -> billing / customers / orders / admin presentation

Deployment system
        -> deploy or update the customer's existing installation
```

## Rules

- `Release_channel` is not part of the deployment or update-release architecture.
- `UPDATE_RELEASE` is not used as the active Engine release source name.
- Billing Store does not become the release source of truth.
- Customer databases remain customer-owned; Store and Master databases remain separate.
- Every immutable release record must retain the exact source repository, source branch, source commit and artifact checksum where available.
