# Platform Review — 2026-07-16

A critical, code-grounded review of what Toqar has built and planned, against
the goal of being the best-in-world agentic product-analytics platform. Written
as the input to a round of persistence-hardening and competitive-feature specs.
Revised after a second, deeper verification pass (three additional findings:
§"Isolation", items 10–12) and after the market research landed (§"Competitive
position", replacing the earlier provisional gap list).

## What is genuinely strong (protect these)

- **The anti-slop discipline is a moat, not a chore.** Deterministic numbers
  (`packages/analysis` has zero LLM deps), the `q_<hash>` citation contract
  (`validateFindingCitations`), the CI anti-slop gate, TDD throughout, and the
  standing adversarial isolation suite. Competitors shipping LLM-generated
  dashboards will produce confident-wrong numbers; "every number carries its
  query" is a defensible trust story. Keep it absolute.
- **The closed loop is the differentiation.** Instrument via PR → analyze with
  cited findings → experiment with always-valid sequential stats → write the
  verdict back to the registry. PostHog *suggests*; Toqar *implements*. Depth on
  the loop is the defense.
- **Registry-as-code** as the shared contract every agent reads/writes is the
  right architectural spine, and the accumulated per-customer context (seam
  maps, taxonomy, experiment history) is the compounding asset.
- **Clean, testable seams.** `SqlExecutor` / `StreamSink` let the whole thing
  run on in-process Postgres (PGlite) with no containers; the data plane has a
  real docker-compose integration job. Tenant isolation is defense-in-depth
  (app-scoping + RLS + owner-only operator tables, the last proven by a
  permission-denied test).

## The biggest risk: the persistence layer is a prototype, not a product

The control plane (Postgres) is solid. The **analytics data plane (ClickHouse +
Redpanda) is where "extremely efficient and reliable while performant" is not
yet true.** Every issue below is real and grounded in the current code.

### ClickHouse schema (`packages/pipeline/src/clickhouse.ts`)

1. **`ORDER BY (tenant_id, event_id)` is the single highest-leverage defect.**
   `event_id` is a random UUID, so the table's primary index sorts data by
   randomness after tenant. TOQAR queries filter by tenant + time + task_type
   (`packages/analysis/src/semantic.ts`), none of which the index can exploit —
   every metric effectively scans the tenant's whole partition set. The sort key
   should lead with the real query predicates (tenant, task_type, event, time);
   dedup identity (`event_id`) can be preserved without being the *leading* key.
2. **`payload String` + `JSONExtract*` on every metric.** All hot fields —
   `cost_usd`, `verification`, `rating.value`, `edit_magnitude.value`, and the
   token/latency/tool/model/status fields — are parsed out of a JSON string at
   query time (`semantic.ts:52-133`). That is CPU on every read and it
   compresses far worse than typed columns. Hot fields should be promoted to
   typed (or `MATERIALIZED`) columns; keep `payload` for the long tail.
3. **`FINAL` on every read** (`semantic.ts:221`). Correct, but ReplacingMergeTree
   `FINAL` merges at query time; cost grows with unmerged parts. At scale this
   needs `do_not_merge_across_partitions_select_final`, insert-time/partition-
   local dedup, or projections — not raw `FINAL` on the hot path.
4. **Daily partitions (`PARTITION BY toDate(timestamp)`).** Monthly is the usual
   default; daily × many tenants invites the "too many parts" failure.
5. **No compression codecs.** No `Delta`/`DoubleDelta` on `timestamp`, no `ZSTD`
   on `payload`, no `T64`/`Gorilla` on numerics — leaving large, cheap wins on
   the table.
6. **No TTL, no tiered storage, no retention.** Storage grows unbounded, there
   is no hot→cold (S3) tier, no per-tenant retention, and **no deletion path** —
   a GDPR/right-to-be-forgotten and cost problem both.
7. **No materialized views / projections.** The 21 metrics recompute from raw
   events every time; common rollups (per-tenant/day merge rate, TSR, cost per
   task) should be incrementally maintained.
8. **`ReplacingMergeTree`, not `ReplicatedMergeTree`.** Single node: no HA, and a
   node loss is data loss. Reliability requires replication + Keeper.
9. **`executed_queries` grows unbounded** (no TTL) — small, but the citation log
   needs a retention story too.

### Stream (`packages/pipeline/src/redpanda.ts`)

10. **Producer is not idempotent and sets no explicit `acks`.** Durability rests
    entirely on ClickHouse dedup; the producer should be `idempotent: true`,
    `acks: all`. Correctness is effectively-once *only because* of
    ReplacingMergeTree — worth making the stream itself durable.
11. **No dead-letter path.** Unmappable messages are counted (good) but dropped;
    a DLQ preserves them for repair.
12. **No topic tiered storage / explicit retention** configured for Redpanda.

### Isolation & correctness findings (second pass)

10. **RLS is built but disengaged on the served path — the headline finding.**
    `tenantTransaction` (which sets `SET LOCAL ROLE toqar_app` + the `app.tenant`
    GUC, correctly transaction-scoped in both bindings) is implemented, tested in
    `rls.test.ts`, and **never called by product code**. Every `RegistryStore`
    method runs on the base *owner* connection with app-level `WHERE tenant_id`
    only — and the owner bypasses RLS entirely (no `FORCE ROW LEVEL SECURITY`).
    App-level scoping is correct (the adversarial suite passes), but the root
    README's "enforced at two layers" claim is true only of paths that opt in,
    and none do. Fix: route tenant-scoped store methods through
    `tenantTransaction`, add `FORCE ROW LEVEL SECURITY`, and connect the service
    as a non-owner role — then the RLS-at-scale hardening below applies. (The
    operator plane deliberately stays owner-run; that design is unchanged.)
11. **Collector can acknowledge-then-drop.** `BufferedSink` 202-acks events,
    then on a sustained broker outage keeps only the last `capacity` messages
    and counts the rest as `dropped` — visible in health, but acknowledged data
    is still lost. Needs spill-to-disk/DLQ or backpressure past the buffer.
12. **The citation log writes on every read.** `createMetricExecutor` inserts
    one `executed_queries` row per metric execution — write-on-read
    amplification, single-row inserts (a "too many parts" hazard under load),
    and unbounded growth. Batch/async these writes and give the table a TTL.

Also verified good on the second pass: the semantic layer is fully
parameterized (`{tenantId:String}` etc.) with tenant always in the WHERE — no
injection or scoping issue; `postgres.ts`'s `tenantTransaction` uses the
correct `SET LOCAL`/`set_config(…, true)` transaction-scoped pattern.

### Net

The data plane *works* (the integration job proves the pipe flows) but it is
tuned for correctness-by-dedup and demo scale, not for efficiency, reliability,
or performance at customer scale. This is the most important thing to harden
before real traffic, and it is almost entirely additive/mechanical work. The
RLS-engagement gap (item 10) is the one finding that is about *trust* rather
than scale, and it contradicts our own docs — fix it first.

## Competitive position (confirmed by market research)

Full report: `docs/research/2026-07-16-market-landscape.md` (14 products, two
cohorts, cited). The load-bearing conclusions:

- **The wedge is real and citable.** No product in either cohort joins
  agent/LLM telemetry to product/business outcomes — Langfuse literally ships
  an *outbound Mixpanel integration* (Nov 2025) because "does this drive
  retention?" is out of its scope. No one does cross-tenant benchmarking
  (Toqar's k-anonymized benchmarking is unique). No one closes the loop:
  PostHog ("nothing reaches production on its own"), LangSmith Engine and
  Arize Signal (draft PRs, human merges), Statsig (automated but config-only).
- **But the first half of our loop is now matched, not ahead.** Autonomous
  narrative analysis ships at LangSmith Engine, Arize Signal, and Datadog
  Patterns; PR-based instrumentation ships at PostHog and Arize. The human
  gate competitors keep is a deliberate safety stance — "it implements" is a
  moat only when paired with guardrails (canary, blast-radius limits,
  auto-rollback, scoped change classes).
- **Table-stakes debt** (we cannot credibly cover our own Q/A/R layers without
  them): an eval framework (LLM-judge + code scorers + datasets — every
  serious competitor has one), an agent trajectory/trace viewer, and a
  first-class session/turn/span/agent schema (Amplitude's beta Agent
  Analytics is the reference model; theirs is chat-shaped, ours must also
  model headless/background agents — open whitespace).
- **Market instability to exploit:** June is dead (absorbed by Amplitude),
  Statsig's brand/team split (Amplitude/OpenAI) creates live customer-trust
  anxiety in exactly our ICP, and Helicone is reportedly in maintenance mode —
  all migration targets. Amplitude is the consolidator moving directly at our
  thesis; its Agent Analytics is still design-partner beta, so shipping GA
  first is a real race.

The ranked 15-feature backlog (evals → trace viewer → agent schema → failure
clustering → guardrailed closed loop → …) is in the research report §5 and is
planned as the `agentic-competitive-features` OpenSpec change; PII redaction
and the compliance floor are planned as `data-governance`.

## Recommendation

Three tracks, planned as OpenSpec changes:

1. **`data-plane-hardening`** — the ClickHouse/Redpanda/Postgres items above,
   sequenced cheap-high-leverage first (schema/codecs/partitioning/typed hot
   columns → projections/materialized views → TTL + tiered storage +
   retention/deletion → producer durability + DLQ → replication/HA + RLS
   engagement). This directly answers "efficient, reliable, performant." The
   RLS-engagement fix (finding 10) and the ack-then-drop fix (finding 11) are
   the two items to pull forward — they are trust issues, not scale issues.
2. **`data-governance`** — the trust/compliance floor for holding source code
   and traces: redaction at ingest, per-tenant envelope encryption +
   crypto-shredding, GDPR erasure with audit, residency routing, SOC 2
   Confidentiality + Privacy.
3. **`agentic-competitive-features`** — the ranked backlog from the market
   research: close the table-stakes debt (evals, trace viewer, agent-native
   schema), then extend the two verified moats (guardrailed closed loop;
   outcome-join + benchmarking).
