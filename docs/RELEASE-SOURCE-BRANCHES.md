# OrbitFS release source architecture

License Master is the authority for release metadata, version records, licence eligibility and deployment/update state. It does not invent or replace the source repositories.

## Base release source

Repository: `lucaskerim123/V1-vercel-base`

The Base/Panel release source lives in the V1 Base repository. License Master captures the exact Base version/source commit used for a release and retains that source reference with the immutable release artifact. A later Base release is compared against the captured source version/commit so the release record can show what changed.

The currently available V1 Base branch is `MASTER_EDIT_SYSTEM`. Do not reference obsolete `base-release`, `release-updates`, `BASE_RELEASE` or `Release_channel` branches as Base release sources.

## Update release source

Repository: `lucaskerim123/V1-vercel-engine`

Branch: `UPDATE_RELEASE`

`UPDATE_RELEASE` is the update-release system for existing installations. It builds Engine/add-on update candidates for MCP, APEX and Studio and can include the update version and the exact source commit used for the candidate. It is not a Billing Store branch and it is not a deployment database/channel.

## Authority flow

```text
V1-vercel-base / MASTER_EDIT_SYSTEM
        -> capture Base version + source commit
        -> compare later Base source changes
        -> immutable release record
        -> License Master

V1-vercel-engine / UPDATE_RELEASE
        -> build existing-installation Engine update candidate
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
- Billing Store does not become the release source of truth.
- Customer databases remain customer-owned; Store and Master databases remain separate.
- Every immutable release record must retain the exact source repository, source branch, source commit and artifact checksum where available.
