# OrbitFS release source branches

License Master is the authority for release metadata, eligibility, licensing and deployment state. It does not invent the customer package source.

## Canonical Base Panel source

Repository: `lucaskerim123/V1-vercel-base`

- Fresh/Base installation package: `base-release`
- Existing-installation update package: `release-updates`

The legacy `BASE_RELEASE` and `UPDATE_RELEASE` branch names are not the canonical release source names. New release tooling must use the lowercase branches above.

## Release rules

`base-release` is core-only and is the source for the current clean Base installation package. It must not include MCP, APEX, Studio or an Engine Host deployment requirement.

`release-updates` is for existing installations. It may contain Base/Panel changes and/or APEX, MCP and Studio update components. Add-on/Engine changes require the update checkpoint and the existing Engine installation to be targeted rather than creating a new Engine deployment.

Every release record should retain the exact source repository, source branch and source commit used to build the immutable artifact. The artifact checksum remains the authority for the packaged bytes; the branch/commit metadata provides source traceability.

## Authority flow

```text
V1-vercel-base/base-release       -> clean Base package
V1-vercel-base/release-updates    -> existing-installation update package
                 |
                 v
          License Master
          release metadata
          checksum / eligibility
                 |
                 v
           Billing Store
           admin review
                 |
                 v
        customer Deploy Update
```
