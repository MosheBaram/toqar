# @toqar/isolation-suite

The standing cross-service adversarial suite. Test-only — it ships no
runtime code. Every deployed surface is attacked with the wrong tenant's
credential, the wrong scope, an absent credential, and a revoked
credential, and must refuse. **New surfaces MUST register here to ship:**
this package is the registry of attack coverage, and it runs on every CI
build (spec: tenancy, design D3).

## Dependencies

| Package | Why |
| --- | --- |
| `@toqar/registry` | `SCHEMA_VERSION` and shared types used to build attack payloads. |
| `@toqar/collector` | Builds a real collector app (`buildCollectorApp`) to attack its `/v1/events` and `/v1/traces` surfaces. |
| `@toqar/registry-service` | Builds the registry app and store; provides the PGlite test executor (`@toqar/registry-service/testing`) the whole suite runs on. |
| `@toqar/mcp-server` | Attacks the read-only MCP surface. |
| `@toqar/analysis-agent` | Exercises analysis surfaces within the isolation matrix. |

## What it asserts

For each surface × credential class, the wrong/absent/revoked/mis-scoped
credential is rejected and no cross-tenant data leaks. Because the suite
composes the *real* apps (not mocks) over an in-process Postgres, a
regression in any service's tenant scoping fails this build.

## Adding a surface

When you add a route or service that touches tenant data, add its attack
cases here in the same session. A surface with no coverage in this suite is
not considered shippable.

## Tests

```bash
pnpm --filter @toqar/isolation-suite test   # attacks.test.ts, mcp.test.ts
```
