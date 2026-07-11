# @toqar/operator

The internal **operator console**: a cross-tenant view for running the
platform — tenant list, per-tenant drill-down, platform rollups, and
service health. React + Vite on the design-system tokens. It is deliberately
separate from the customer product (`apps/web`, a per-tenant findings feed):
different audience, different data scope, different auth.

This is the one surface that reads *across* tenants. It talks only to the
operator API on the registry service, which is gated by an `operator` token
(see `packages/registry-service` — `OperatorStore` and the `/operator/*`
routes). A tenant token can never reach it (403), and every operator read is
audited.

## Dependencies

| Package | Why |
| --- | --- |
| `@toqar/registry-service` | (dev/test) The operator API it consumes — `buildApp`, `OperatorStore`, the PGlite test executor. The client is tested against a real service instance. |

The console defines its own view types locally (mirroring the server
shapes), so at runtime it depends only on React.

## Views

| View | What it shows |
| --- | --- |
| Tenants | Every tenant with onboarding step, autonomy level, and billing tier; click through to a drill-down of that tenant's real recorded state. |
| Platform | Rollups computed from records — merge rate, recurring/invoiced revenue, onboarding funnel, median time-to-first-finding, finding rejections. Honest empty states. |
| Health | Truthful service health (registry database reachability; degraded shown as degraded). |

Every number comes from the operator API with its source in the control
plane — the console fabricates nothing.

## Develop

```bash
pnpm --filter @toqar/operator dev        # Vite dev server; connect with an operator token
pnpm --filter @toqar/operator build
pnpm --filter @toqar/operator typecheck
pnpm --filter @toqar/operator test       # formatters + api client against the real service
```

## Deployment

Hosting is operator-gated with the rest of the platform. Bootstrap the first
operator token with `OperatorStore.createOperatorToken(operator)` (audited);
the console then connects with that token.
