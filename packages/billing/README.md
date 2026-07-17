# @toqar/billing

Usage-metered billing. A bill line reconciles to a query, same discipline
as every other number in the product — no estimates, no fake data.

## Meters

`usageMeterSql(metric, window)` generates tenant-scoped, `FINAL`-reading
ClickHouse SQL over `toqar.events`:

- `events_ingested` — `count()`
- `tasks_tracked` — `uniqExact(task_id)`
- `agent_runs` — distinct `(task_id, run_id)`

Verified against real ClickHouse in the pipeline integration job:
`events_ingested` equals a direct count of the same window.

## Tiers

Defined in code (`TIERS`), seeded from the validation willingness-to-pay
evidence (Starter $200/mo, Growth $800/mo). `resolveTier` picks the
smallest tier covering usage; `planFor` reports usage-against-limit so
there is no surprise overage.

## Payments

Stripe holds all card data. Toqar stores only `customer_id` and
`subscription_id` — there is no field for card data, and a source scan
enforces it. PCI scope stays with the provider.

## Tiers

A free Developer tier (50k events / 10k tasks / 500 runs per month) is the
PLG entry point (go-to-market §8.1); `starter` ($200) and `growth` ($800)
are seeded from the validation WTP threshold. New tenants default to free.
