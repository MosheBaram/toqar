# @toqar/web

The customer app: a per-tenant **feed of agent findings**, not a dashboard
grid. React + Vite on the design-system tokens. It reads one tenant's
findings, registry, autonomy, and onboarding through the registry backend —
tenant-scoped by the bearer token, no tenant ids in URLs.

## Dependencies

| Package | Why |
| --- | --- |
| `@toqar/registry` | The `Finding` and `RegistryEntry` shapes the feed and registry browser render. |
| `@toqar/analysis` | Metric definitions used to label and format evidence in findings. |
| `@toqar/registry-service` | The backend the tenant API client calls (findings, registry, autonomy, onboarding). |

## Views

| View | What it shows |
| --- | --- |
| Feed | Findings with layer (T/O/Q/A/R) and severity filters; each finding drills into its cited evidence. |
| Registry | The tenant's event registry — the shared contract, browsable. |
| Settings | The audited autonomy dial: read-only analysis → instrumentation PRs → experiment PRs, each grant recorded with who granted it. |

Onboarding and benchmark views ride alongside the feed. Every number shown
comes from the backend with its citation — the app fabricates nothing.

## Develop

```bash
pnpm --filter @toqar/web dev        # Vite dev server
pnpm --filter @toqar/web build      # production build
pnpm --filter @toqar/web typecheck
```

## Tests

```bash
pnpm --filter @toqar/web test   # api client, formatting, onboarding, benchmark
```
