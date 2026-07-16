# Data Modeling & Governance Best Practices for Toqar — Research Synthesis

*Research conducted July 2026 via web sources; publication dates noted inline. "Must have" = trust/compliance/correctness floor; "Nice to have" = utility/differentiation. Unverified items flagged explicitly at the end of each area.*

## Cross-cutting takeaway

The LLM-observability industry (Langfuse, LangSmith, OpenLLMetry, SigNoz, Braintrust, Arize/Phoenix) has **converged** on a common shape, so Toqar should adopt the consensus rather than invent: OTel `gen_ai.*` as the wire vocabulary → a **wide, denormalized, span/observation-first table in ClickHouse** ordered by `tenant_id` first → **blob/metadata split** (payloads to S3, typed metrics in ClickHouse) → **redaction at ingest** → an **eval/scoring/versioning layer** on top keyed by a `(trace, version-tuple, evaluator-version, score)` join. Everything else is detail.

---

## 1. OpenTelemetry for GenAI/agents + trace data model + ClickHouse storage

### OTel GenAI semantic conventions — status
- The GenAI conventions were split into a dedicated repo `open-telemetry/semantic-conventions-genai`; namespaces are `gen_ai.*`, `mcp.*` (Model Context Protocol), and provider-specific (`openai.*`).
- **Everything is `Development` stability** (below Stable/RC) — verified attribute-by-attribute on the OTel registry as of v1.41.1 (May 2026). No public stabilization timeline. Version churn is real and recent: `invoke_agent` split in v1.41 into CLIENT (remote agent) vs INTERNAL (local execution); `execute_tool` requires the tool name in the span identifier (v1.41); MCP conventions added v1.39. v1.36 is the transition baseline; `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` opts into the new format. [OTel gen-ai registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/); [Greptime, 2026-05-21](https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions); [OTel blog, 2026](https://opentelemetry.io/blog/2026/genai-observability/).
- **Standardized operations** (`gen_ai.operation.name`): inference — `chat`, `text_completion`, `generate_content`, `embeddings`; agent — `create_agent`, `invoke_agent`, `invoke_workflow`; tool — `execute_tool`. Typical hierarchy: `invoke_agent` (root) → `chat` (per model call) + `execute_tool` (per tool call).
- **LLM-call attributes**: `gen_ai.provider.name` (newer discriminator, supersedes/augments `gen_ai.system`), `gen_ai.request.model` / `response.model`, `gen_ai.request.temperature|max_tokens`, `gen_ai.response.finish_reasons`, `gen_ai.usage.input_tokens|output_tokens`, `gen_ai.conversation.id`, `gen_ai.agent.id|name`, `gen_ai.tool.name|call.id|type`. Metrics: `gen_ai.client.operation.duration`, `gen_ai.client.token.usage`.
- **Prompt/completion content capture is unsettled** — three modes (not recorded [default], span attributes `gen_ai.input.messages`/`output.messages`, or external-storage references [recommended for prod]). Sources disagree on whether content rides as span attributes or as a `gen_ai.client.inference.operation.details` event. **Support both; don't hard-code one.** (flagged)
- Adoption signal: Datadog, Honeycomb, New Relic consume these; LangChain, CrewAI, AutoGen emit them. Validates Toqar's OTLP/HTTP ingest choice. [Datadog blog](https://www.datadoghq.com/blog/llm-otel-semantic-convention/).

### How the vendors model traces
- **Langfuse** (closest analog): `trace` → **observations** nested via `parent_observation_id`; three observation types — **SPAN** (generic work), **GENERATION** (special span for one LLM call: model/prompt/completion/tokens/cost), **EVENT** (point-in-time). This trichotomy maps almost exactly to Toqar: tool call = SPAN, LLM call = GENERATION, handoff/override/feedback = EVENT. [Observation Types](https://langfuse.com/docs/observability/features/observation-types); [Data Model](https://langfuse.com/docs/observability/data-model).
- **LangSmith**: "runs" (= spans) with `run_type` (`llm`/`tool`/`chain`/`retriever`), trace = run tree. Steal their **`dotted_order`** materialized-path key — a sortable string encoding hierarchy position, making waterfall sort O(1) without recursive parent walks. [Run data format](https://docs.langchain.com/langsmith/run-data-format); [RunTree reference](https://docs.smith.langchain.com/reference/js/classes/run_trees.RunTree).
- **OpenLLMetry (Traceloop)**: pure OTel extension over OTLP; OpenLLMetry-emitting customers will send `gen_ai.*` spans with zero custom SDK on Toqar's side. [Introducing OpenLLMetry](https://www.traceloop.com/blog/openllmetry); [repo](https://github.com/traceloop/openllmetry).

### Canonical agent-trace model
```
Trace (trace_id)
 └─ Span (span_id, parent_span_id)
     ├─ AGENT/WORKFLOW (invoke_agent / invoke_workflow)
     ├─ GENERATION/LLM (chat) — model, tokens, cost, latency, finish_reason
     ├─ TOOL (execute_tool) — tool name, call id, args/result
     └─ EVENT — handoff, override, feedback, error (point-in-time)
```
Parent-child via `parent_span_id` + a materialized-path/`dotted_order` column. **Span links** (arrays of `(trace_id, span_id, attributes)`) for non-parent-child causality — e.g. linking a handoff span to the resumed run, or a retry to its original. Waterfall = fetch all spans for `trace_id`, sort by start time / dotted_order, chain via `parent_span_id`. Toqar mapping: task/run/step → nested spans (task=root, run=child, step=grandchild); tool call → TOOL span; feedback/override/handoff → EVENT rows.

### ClickHouse storage (best-documented area, strong convergence)
- **Wide, flat, denormalized, span-first table is the winning pattern.** Langfuse migrated from a normalized traces+observations split to a single wide immutable "Events" table (trace-level metadata copied onto every span row to kill joins) and got **~3x less memory, up to 20x faster queries**; initial table loads seconds→ms; dashboards 10x+ faster. [Langfuse "Simplifying for Scale", 2026-03-10](https://langfuse.com/blog/2026-03-10-simplify-langfuse-for-scale); [ClickHouse × Langfuse, 2026-02-03](https://clickhouse.com/blog/langfuse-llm-analytics).
- **Late-arriving span data decision (up front):** Langfuse moved to **immutable** rows (SDK assembles the full span via OTel Context/Baggage before insert; a 3-min micro-batch join with 5-min delay for legacy SDKs). Alternative is `ReplacingMergeTree(version)` keyed on span id + dedup at merge/read — works but is a perf tax at scale. Pick one deliberately.
- **Attributes**: `Map(LowCardinality(String), String)` (+ separate numeric/bool maps as SigNoz does: `attributes_string`, `attributes_number`, `attributes_bool`), then **promote hot attributes to typed materialized columns** at insert: model, provider, input/output tokens, cost, latency, operation name, tool name, tenant_id. Downside of Map: reading a key loads the whole column. [ClickHouse schema-design](https://clickhouse.com/docs/use-cases/observability/schema-design); [SigNoz traces schema](https://signoz.io/docs/userguide/writing-clickhouse-traces-query/).
- **ORDER BY leads with `tenant_id` + date/time, NOT trace_id** (Langfuse leads with `project_id` = their tenant, granule max size raised 10MiB→64MiB). This is the single most important multi-tenant decision — gives per-tenant + time-range data pruning for dashboards. Because trace_id isn't leading, add a **bloom-filter skip index on `trace_id`** + a companion `trace_id → (tenant_id, min_ts, max_ts)` table (mirrors ClickHouse's `otel_traces_trace_id_ts`) for direct trace opens. SigNoz variant: `ts_bucket_start` (30-min buckets) + `resource_fingerprint` in the ORDER BY.
- **Events/links**: store OTel span-events + links as **Nested/parallel arrays** on the span row for waterfall fidelity (`Events.Timestamp Array(DateTime64(9))`, `Events.Name Array(LowCardinality(String))`, `Events.Attributes Array(Map(...))`; `Links.TraceId/SpanId/Attributes Array(...)`), BUT keep **handoff/override/feedback as first-class EVENT rows** in the wide table — you'll want to aggregate "override rate per agent per tenant," which is hard if buried in arrays.
- **Types/codecs**: `trace_id` as `FixedString(32)`/`String` + ZSTD; timestamps `Delta(8), ZSTD(1)` (but not on primary-key columns — hurts query perf); `LowCardinality` for names/status/model/provider; avoid `Nullable`; downgrade `DateTime64(9)`→`DateTime` where ns precision isn't needed; `PARTITION BY toDate(start_time)`. Engine: `MergeTree` if assembling complete immutable spans, `ReplacingMergeTree(version)` if accepting late/partial updates. Text indexes (CH 26.2+) available for full-text span search.
- Reference implementations: SigNoz (`distributed_signoz_index_v3`); ClickHouse's own OTel exporter (`otel_traces` + `otel_traces_trace_id_ts`); Langfuse wide Events table. Uptrace/HyperDX/ClickStack are known CH-on-OTel products but their specific schemas were not fetched from primary sources (flagged).

**Must have (area 1):** ingest `gen_ai.*` over OTLP/HTTP but **normalize into a stable internal schema at ingest** (pin semconv version, honor the opt-in env var); wide denormalized span-first table; `ORDER BY (tenant_id, date, …)`; bloom index + companion trace-id table; materialized typed columns for model/tokens/cost/latency; typed span discriminator (GENERATION/TOOL/AGENT/EVENT); first-class EVENT rows for handoff/override/feedback; decide immutable-assemble vs ReplacingMergeTree.

**Nice to have:** `dotted_order` path column; span links as Nested arrays; external-blob content storage; native metric ingestion; text index (CH 26.2+); 64MiB granule tuning at scale.

**Flagged:** content-capture mechanism unsettled in spec (span attributes vs `gen_ai.client.inference.operation.details` event); no stabilization timeline; Uptrace/HyperDX/ClickStack exact schemas not fetched from primary sources; re-check per-attribute stability against your pinned version.

### Sources (area 1)
- [OTel GenAI attribute registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) (accessed Jul 2026)
- [OTel semantic-conventions-genai repo](https://github.com/open-telemetry/semantic-conventions-genai)
- [OTel blog: Inside the LLM Call](https://opentelemetry.io/blog/2026/genai-observability/) (2026)
- [Greptime: How OpenTelemetry Traces LLM Calls, Agent Reasoning, and MCP Tools](https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions) (2026-05-21)
- [Datadog: OTel GenAI semantic conventions](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)
- [Langfuse Observation Types](https://langfuse.com/docs/observability/features/observation-types) / [Data Model](https://langfuse.com/docs/observability/data-model)
- [Langfuse: Simplifying Langfuse for Scale](https://langfuse.com/blog/2026-03-10-simplify-langfuse-for-scale) (2026-03-10)
- [ClickHouse: Langfuse scaling for the agentic era](https://clickhouse.com/blog/langfuse-llm-analytics) (2026-02-03)
- [LangSmith Run data format](https://docs.langchain.com/langsmith/run-data-format) / [RunTree reference](https://docs.smith.langchain.com/reference/js/classes/run_trees.RunTree)
- [Traceloop: Introducing OpenLLMetry](https://www.traceloop.com/blog/openllmetry) / [OpenLLMetry repo](https://github.com/traceloop/openllmetry)
- [ClickHouse: Designing a schema for observability](https://clickhouse.com/docs/use-cases/observability/schema-design)
- [SigNoz: Traces Schema](https://signoz.io/docs/userguide/writing-clickhouse-traces-query/)

---

## 2. High-cardinality & cost control

### Sampling
- **Head** (SDK, at trace start): simple, predictable cost, but blind to outcome — can't guarantee "keep all errors." **Tail** (OTel Collector, after trace completes): policies on error/latency/attributes, but buffers full traces in memory (`decision_wait` default ~30s, `num_traces` cap, `expected_new_traces_per_sec`, `sampled_cache_size`) and needs a two-layer `loadbalancing`-exporter topology so all spans of a trace land on one collector. ~13 policy types (`latency`, `status_code`, `probabilistic`, `string_attribute`, `numeric_attribute`, `rate_limiting`, `and`/`composite`, `ottl_condition`). [OTel Sampling](https://opentelemetry.io/docs/concepts/sampling/); [oneuptime, 2026-02-06](https://oneuptime.com/blog/post/2026-02-06-head-based-vs-tail-based-sampling-opentelemetry/view); [controltheory, 2025-01-23 / upd. 2026-02-27](https://www.controltheory.com/resources/tail-sampling-with-the-otel-collector/).
- **LLM-specific tension**: the response content *is* the eval signal — sampling destroys what you need for quality/drift; metadata alone can't tell you if the model hallucinated or a prompt change regressed. Modern ClickHouse-native thesis: **keep 100% unsampled, control cost via storage tiering, not by dropping data.** [ClickHouse high-cardinality, 2025-11-21](https://clickhouse.com/resources/engineering/high-cardinality-slow-observability-challenge); [Braintrust guide](https://www.braintrust.dev/articles/llm-observability-guide); [inference.net](https://inference.net/content/llm-observability-monitoring-production-deployments/).

**Recommendation:** MUST 100% ingestion as default; offer **tail sampling as an opt-in per-tenant cost lever** (keep-all-errors + keep-all-slow + probabilistic remainder). NICE a "keep-for-eval" carve-out (always retain N traces/day/tenant). **Consider doing sampling in Toqar's own post-assembly pipeline rather than the Collector** — agent traces are unusually long-lived (multi-minute) and can exceed the 30s `decision_wait`, mis-sampling them. (flagged tradeoff)

### Cardinality control
- High-cardinality fields (user/trace IDs, model versions, prompts, tenants, graph nodes) cause slow queries, forced dropping, ingestion lag. ClickHouse beats TSDBs/search engines (columnar selective reads, vectorized execution, 10–30x compression, no index explosion, bloom skip-indexes for point lookups). [ClickHouse, 2025-11-21](https://clickhouse.com/resources/engineering/high-cardinality-slow-observability-challenge); [ClickHouse observability year in review](https://clickhouse.com/blog/observability-a-year-in-review).
- **`LowCardinality`** sweet spot is **<~10K distinct**; can perform *worse* than plain type **above ~100K** (dictionary grows, position index widens). Good: `tenant_id`, `service`, `model`, `provider`, `span_kind`, `status_code`, `environment`. Bad (plain `String`): `trace_id`, `span_id`, `user_id`, `session_id`, `run_id`, URLs with embedded IDs. [Last9](https://last9.io/blog/clickhouse-lowcardinality/); [pulse.support](https://pulse.support/kb/clickhouse-lowcardinality-guide); [chistadata](https://chistadata.com/clickhouse-complete-guide-to-lowcardinality/); [oneuptime, 2026-01-21](https://oneuptime.com/blog/post/2026-01-21-clickhouse-high-cardinality-data/view).
- Arbitrary attrs in `Map(LowCardinality(String), String)`; `ORDER BY (tenant_id, service, toStartOfHour(ts), ...)`; bloom-filter skip index on `trace_id`. Add per-tenant cardinality guardrails on custom attribute *keys* so one tenant's bad instrumentation can't bloat shared dictionaries. Don't reflexively wrap everything in `LowCardinality` — measure distinct counts.

### Keeping storage affordable (universal vendor pattern)
- **Blob/metadata split**: Langfuse (ClickHouse for traces/spans/generations/scores, Postgres for transactional/config, **S3/blob for large payloads**, Redis cache) and Helicone (metadata→ClickHouse, request/response bodies→S3/MinIO, Postgres transactional, Kafka ingestion) both do it. Retrofitting later is painful — do it day one. [Langfuse architecture](https://langfuse.com/handbook/product-engineering/architecture); [ClickHouse × Langfuse, 2025-06-23](https://clickhouse.com/blog/langfuse-and-clickhouse-a-new-data-stack-for-modern-llm-applications); [Helicone platform overview](https://helicone-helicone-7.mintlify.app/platform-overview).
- **TTL tiering**: hot SSD → warm ClickHouse-on-S3-disk (`TTL … TO VOLUME 's3'`, ~$0.023/GB/mo vs $0.10–0.30 SSD) → delete/Glacier at retention horizon; `ZSTD` on cold/text columns, `LZ4` for hot. Make retention **per-tenant/per-plan**. [oneuptime S3 cold storage, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-s3-cold-storage/view); [oneuptime cost checklist, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-cost-optimization-checklist/view); [ClickHouse managing data](https://clickhouse.com/docs/observability/managing-data).
- **Vendor billing units**: spans+ingest-GB (Phoenix: Free 25K spans/mo, 1GB, 15-day; Pro $50/mo 50K spans, 10GB, 30-day), processed-GB+scores (Braintrust: Starter free, Pro $249/mo 5GB, 50K scores, 30-day), retention tiers (Langfuse). Spans+GB is most transparent and maps directly to Toqar's ClickHouse+S3 costs. [aibizhub pricing, 2026](https://aibizhub.io/articles/llm-observability-pricing-braintrust-vs-phoenix-vs-langfuse-2026/); [Arize pricing](https://arize.com/pricing/).

### Token/cost accounting
- **Mutually-exclusive token buckets** (Langfuse model): `input`, `output`, `cache_read`, `cache_write`, `reasoning` — each token counted once. Normalize providers that report *inclusive* counts (OpenAI counts cached inside prompt_tokens — subtract: 17,903 prompt with 17,817 cached → store input 86, input_cached 17,817). [Langfuse token & cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking).
- **Effective-dated versioned pricing table** keyed by `(provider, model, effective_from)`, regex-matched on model string (custom defs priority over built-ins), with tiered conditions (e.g. Claude Sonnet >200K input priced differently). **Compute cost at ingest and snapshot the applied unit prices / `pricing_version` onto the row** so historical cost is immutable and auditable; changing a price never retro-recalcs old traces (correct default).
- **Prompt caching**: cache reads up to ~90% off input (Anthropic/OpenAI), ~75% off (Google implicit); cache writes ~1.25–2× input; **discounts apply to input only, never output**. OpenAI auto-caches >1,024 tokens (`cached_tokens`); Anthropic needs explicit `cache_control` (`cache_creation_input_tokens` vs `cache_read_input_tokens`). Monitor read:write ratio — below ~10:1 signals unstable prefixes. [digitalapplied, 2026](https://www.digitalapplied.com/blog/prompt-caching-2026-cut-llm-costs-keep-quality); [OpenAI](https://openai.com/index/api-prompt-caching/); [Anthropic caching](https://hidekazu-konishi.com/entry/anthropic_claude_api_prompt_caching_and_token_efficiency.html).
- **Providers without token counts**: fall back to local tokenization but **tiktoken undercounts Claude** (badly on code/non-English), and **reasoning models can't have cost inferred** (hidden reasoning tokens) — you *must* have provider-reported counts. Add a **`cost_source` flag** (`provider_reported` | `inferred_from_tokens` | `estimated_no_tokens`) so estimated costs are never shown as authoritative.

**Must have (area 2):** 100% ingest default + opt-in tail sampling (keep-all-errors/slow + probabilistic); blob(S3)/metadata(ClickHouse) split; `LowCardinality` only for bounded columns, `Map` for arbitrary attrs, `ORDER BY (tenant_id, …)` + bloom index on trace_id, `ZSTD` on cold/text; TTL tiering hot→warm-S3→delete, retention per tenant/plan; effective-dated pricing table + mutually-exclusive token buckets + cost snapshotted at ingest + `cost_source` flag + per-run/tenant rollups via `AggregatingMergeTree`.

**Nice to have:** eval carve-out sampling; content-addressed dedup for repeated system prompts; materialized-view dashboard rollups; per-tenant cardinality guardrails; cache hit-rate + read:write-ratio metrics; cost/eval-score alerting (>10% below rolling 7-day baseline).

**Flagged:** Langfuse tier day-boundaries (0–7/8–90/91+) are from a third-party Medium post, not official docs; Helicone details from a non-canonical docs mirror; vendor pricing is a fast-moving 2026 snapshot; **Langfuse was acquired by ClickHouse (~Jan 2026)** so its "neutral stack" framing is now first-party marketing; no canonical ClickStack schema DDL found.

### Sources (area 2)
- [OpenTelemetry Sampling concepts](https://opentelemetry.io/docs/concepts/sampling/)
- [Head vs tail sampling — oneuptime, 2026-02-06](https://oneuptime.com/blog/post/2026-02-06-head-based-vs-tail-based-sampling-opentelemetry/view)
- [OTel Collector tail_sampling — controltheory, 2025-01-23 / upd. 2026-02-27](https://www.controltheory.com/resources/tail-sampling-with-the-otel-collector/)
- [Braintrust LLM observability guide](https://www.braintrust.dev/articles/llm-observability-guide); [inference.net](https://inference.net/content/llm-observability-monitoring-production-deployments/)
- [ClickHouse high-cardinality, 2025-11-21](https://clickhouse.com/resources/engineering/high-cardinality-slow-observability-challenge); [observability year in review](https://clickhouse.com/blog/observability-a-year-in-review)
- [LowCardinality — Last9](https://last9.io/blog/clickhouse-lowcardinality/); [pulse.support](https://pulse.support/kb/clickhouse-lowcardinality-guide)
- [Langfuse × ClickHouse, 2025-06-23](https://clickhouse.com/blog/langfuse-and-clickhouse-a-new-data-stack-for-modern-llm-applications); [Langfuse architecture](https://langfuse.com/handbook/product-engineering/architecture)
- [Langfuse tiering — Medium/Harsoor](https://medium.com/@sharanharsoor/cost-optimization-in-llm-observability-how-langfuse-handles-petabytes-without-breaking-the-bank-0b0451242d1e); [Langfuse scaling](https://langfuse.com/self-hosting/configuration/scaling)
- [Helicone platform overview](https://helicone-helicone-7.mintlify.app/platform-overview)
- [ClickHouse TTL/S3 — oneuptime, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-s3-cold-storage/view); [cost checklist](https://oneuptime.com/blog/post/2026-03-31-clickhouse-cost-optimization-checklist/view); [ClickHouse managing data](https://clickhouse.com/docs/observability/managing-data)
- [Langfuse token & cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
- [Prompt caching — digitalapplied, 2026](https://www.digitalapplied.com/blog/prompt-caching-2026-cut-llm-costs-keep-quality); [OpenAI](https://openai.com/index/api-prompt-caching/); [Anthropic caching](https://hidekazu-konishi.com/entry/anthropic_claude_api_prompt_caching_and_token_efficiency.html)
- [Vendor pricing — aibizhub, 2026](https://aibizhub.io/articles/llm-observability-pricing-braintrust-vs-phoenix-vs-langfuse-2026/); [Arize pricing](https://arize.com/pricing/)

---

## 3. Governance for sensitive data

### PII detection/redaction
- **Microsoft Presidio** is the de-facto OSS engine (Analyzer: NER via spaCy/transformers + regex + context words + checksums → Anonymizer: redact/mask/hash/replace/encrypt; plus Image Redactor, Structured, CLI), with a **no-recall-guarantee** caveat — never market redaction as absolute. Layered approach: regex (fast, brittle, structured tokens) + NER (context-aware) as fast primary, LLM-based redaction reserved for high-risk/ambiguous fields like source code (highest cost/latency, itself a data-exposure surface). [Presidio](https://github.com/microsoft/presidio); [explainx.ai, 2026](https://explainx.ai/blog/microsoft-presidio-pii-detection-anonymization-guide-2026); [ijaibdcms, 2025](https://ijaibdcms.org/index.php/ijaibdcms/article/view/339); [oneuptime LLMOps PII, 2026](https://oneuptime.com/blog/post/2026-01-30-llmops-pii-detection/view).
- **Guard four PII entry points**, mapping to span types: user input, RAG/retrieved context, tool results, model output. Redact each span type, not just the top-level prompt.
- **What vendors do**: Langfuse masks **SDK-side before data leaves the app** (`mask_otel_spans` hook / legacy `mask`; irreversible; regex + external libs like llm-guard; does not bundle Presidio). Arize Phoenix is OTel-native/self-host, redaction upstream via instrumentation/guardrails. Helicone proxy/gateway with key vaults. LiteLLM is the common glue — Presidio guardrails with `logging_only` mode redact *after* the LLM call but *before* logging. [Langfuse masking](https://langfuse.com/docs/observability/features/masking); [LiteLLM Presidio](https://docs.litellm.ai/docs/tutorials/presidio_pii_masking); [LiteLLM PII v2](https://docs.litellm.ai/docs/proxy/guardrails/pii_masking_v2).
- **At-ingest (irreversible) vs at-query (reversible tokenization)**: ingest redaction = PII never lands in ClickHouse, smallest breach radius, **out of GDPR scope**, but destroys re-eval/replay ability and can't retroactively re-redact misses. Reversible **deterministic format-preserving tokenization** (mapping vault) preserves entity co-reference + analytic utility but stays **regulated/pseudonymized under GDPR** and makes the token↔value map the crown-jewel secret. Masking = anonymized/out-of-scope/useless; tokenization = reversible/in-scope/useful; deletion = removes entirely. [Red Gate 5 techniques](https://www.red-gate.com/simple-talk/data-security-privacy-compliance/how-to-anonymize-pii-in-llm-pipelines-5-key-techniques-explained/); [pctechmag, 2026-06](https://pctechmag.com/2026/06/pii-redaction-for-llms-in-2026-how-to-strip-sensitive-data-before-it-leaves-your-perimeter/); [Protecto, 2025](https://medium.com/@protectoai/unlocking-llm-privacy-strategic-approaches-for-2025-d1af6a34e9d1).

**Recommendation:** MUST redact **at ingest** (customer SDK/collector or Toqar gateway edge, before ClickHouse), Presidio regex+NER over every span type, with a **dedicated secrets/credentials recognizer class for source code** (distinct from personal PII). Keep raw code/prompts out of persistent store by default; un-redacted retention is an explicit per-tenant contractual opt-in. NICE reversible tokenization = premium per-tenant mode (vault encrypted per-tenant), documented as pseudonymization not anonymization. FLAG Presidio recall not guaranteed; budget for LLM-based secondary redaction on code.

### Field-level encryption
- **Envelope encryption**: per-tenant DEK encrypts data, KEK in cloud KMS (AWS/GCP/Azure) wraps the DEK, wrapped DEK stored beside ciphertext. Per-tenant keys make isolation cryptographic and enable **crypto-shredding** (destroy tenant KEK → data instantly unreadable, KMS log = receipt). AWS 2025 guidance favors a cost-conscious KMS-KEK + per-tenant-DEK combo over one KMS key per tenant. **Encrypt selectively** (PII/credentials/high-risk only). [AWS Architecture Blog, 2025-08](https://aws.amazon.com/blogs/architecture/simplify-multi-tenant-encryption-with-a-cost-conscious-aws-kms-key-strategy/); [Google Cloud envelope/crypto-shred](https://medium.com/google-cloud/encryption-key-control-in-saas-deployments-fd67e8bc6af5); [awssome](https://www.awssome.io/blog/multi-tenant-saas-security-encryption-faqs).
- **ClickHouse**: encrypted disk (AES-128-CTR, keys from config/env; Altinity two-level variant for rotation); column-level `encrypt()`/`decrypt()` (aes-256-gcm) at app layer; ClickHouse Cloud Enterprise **TDE + CMEK** — but CMEK is **service-wide, must be enabled at service creation (can't encrypt existing services or disable without migration), ~5–15% perf penalty, and dropping the CMEK key stops the service and makes ALL its data unretrievable, not one tenant.** [Altinity KB](https://kb.altinity.com/altinity-kb-setup-and-maintenance/disk_encryption/); [oneuptime column-level, 2026-03](https://oneuptime.com/blog/post/2026-03-31-clickhouse-column-level-encryption-functions/view); [ClickHouse CMEK](https://clickhouse.com/docs/cloud/security/cmek).

**Recommendation:** MUST use envelope encryption with **application-managed per-tenant DEKs** (NOT relying on CMEK) for the most sensitive payloads (raw/tokenized prompts, source-code snippets, token-mapping vault) — this is what makes single-tenant crypto-shred possible; encrypt selectively at column/payload level. NICE TDE/CMEK = defense-in-depth checkbox (enable at creation). FLAG column-level `encrypt()` breaks filter/aggregate on those fields — reserve for fields never queried; 5–15% penalty is vendor-stated.

### Data residency
- ClickHouse Cloud services are **independent per region** (cross-region replication not automatic); regional clusters are the standard EU/US residency mechanism. Tenant-level segregation (separate DBs/pipelines for EU vs non-EU) also makes per-tenant deletion + verifiable export reliable. Pragmatic pattern: **regionalize the data plane** (storage + inference/redaction over raw payloads), keep a **global control plane** (auth, non-personal metadata). [ClickHouse multi-region, 2026-03](https://oneuptime.com/blog/post/2026-03-31-clickhouse-cloud-multi-region-deployments/view); [supported regions](https://clickhouse.com/docs/cloud/reference/supported-regions); [WorkOS data residency](https://workos.com/blog/data-residency-for-enterprise-saas); [martinuke0 multi-tenant isolation, 2026-03](https://martinuke0.github.io/posts/2026-03-16-mastering-multi-tenant-data-isolation-strategies-for-scalable-cloud-infrastructure-and-saas-applications/).

**Recommendation:** MUST (for EU enterprise) deploy **regional ClickHouse clusters** (EU+US) + a **residency tag on the tenant record in Postgres** that deterministically routes ingest/query. NICE keep the Postgres control plane global with only non-personal metadata. FLAG cross-region features (global dashboards) fight residency — design aggregations per-region, combine only non-personal aggregates; confirm exact EU region availability.

### GDPR erasure in append-oriented ClickHouse

| Mechanism | Immediacy | Physical removal | Cost | Best for |
|---|---|---|---|---|
| Lightweight DELETE (22.8+, `_row_exists`) | Immediate (logical) | Eventual (at merge / `OPTIMIZE FINAL`) | Very low | Ad-hoc row erasure |
| ALTER TABLE DELETE (mutation) | Delayed async (`system.mutations`) | Guaranteed (rewrites whole parts) | Very high I/O / write amplification | Provable deletion, small volumes |
| TTL | At boundary | Yes (background) | Cheap | Retention windows |
| Partition DROP | Immediate | Immediate | Cheapest | Bulk erasure if partitioned right |
| Pseudonymization (overwrite w/ hash) | Immediate | N/A (identifiers gone) | Fast | Keep aggregates, drop identity |
| Crypto-shredding | Immediate + provable | N/A (key gone) | Instant | Per-tenant offboarding at scale |

[oneuptime GDPR erasure, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-gdpr-right-to-erasure/view); [oneuptime mutations vs lightweight deletes, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-mutations-vs-lightweight-deletes/view); [ClickHouse DELETE docs](https://clickhouse.com/docs/sql-reference/statements/delete); [nocql.dev dynamic TTL](https://nocql.dev/posts/clickhouse-dynamic-ttl/).

**Recommendation:** MUST **partition trace/code tables by tenant + time** (offboarding = instant `DROP PARTITION`); **dynamic per-tenant TTL via ClickHouse dictionaries** for retention; for single end-user RTBF, **lightweight DELETE for immediate invisibility + scheduled batched `OPTIMIZE FINAL`/mutation** for physical removal + an **erasure audit table** (request→completion). **Avoid per-request `ALTER TABLE DELETE` mutations** (write amplification crushes a busy cluster). STRONGLY RECOMMENDED **crypto-shredding as primary full-tenant erasure** — sidesteps append/mutation pain, instant + provable, provided per-tenant DEKs exist. FLAG crypto-shred only satisfies GDPR if no plaintext copies survive in backups/logs/search index (verify backup lifecycle; encrypt backups under the per-tenant key).

### SOC 2
- Five Trust Services Criteria: **Security (mandatory, CC1–CC9)**, Availability, Processing Integrity, **Confidentiality**, **Privacy** (select optional four per contract). Security PoF: asset inventory, logical access, authn (SSO/IdP, **MFA**), network segmentation, encryption at rest+transit, key management. Confidentiality splits into **C1.1 Data Classification** and **C1.2 Protection Mechanisms** (encryption, access restriction, **secure deletion**). Audit logging + continuous monitoring throughout. Tenant isolation isn't a named criterion — evidenced under logical-access + confidentiality. [Secureframe TSC 2025](https://secureframe.com/hub/soc-2/trust-services-criteria); [Schellman](https://www.schellman.com/blog/soc-examinations/soc-2-trust-services-criteria-with-tsc); [Drata](https://drata.com/learn/soc-2/trust-services-criteria).

**Recommendation (all MUST for compliance):** data-classification scheme with source code / PII-traces / metadata as distinct tiers (drives which fields get redaction/encryption); SSO + MFA + least-privilege RBAC with **tenant-scoped authorization on every read path** (source code tighter than aggregate metrics); encryption at rest + in transit with documented key management; **immutable access audit logging** + the erasure audit table; documented ClickHouse erasure + crypto-shred runbook as the formal C1.2 control. NICE scope **Confidentiality + Privacy** into the SOC 2 report (enterprise buyers holding source code expect it; sales differentiator).

### Priority summary (area 3)
**Must have (trust/compliance floor):** (1) Presidio redaction at ingest over all span types + secrets recognizer for source code; (2) envelope encryption with per-tenant app-managed DEKs (enables single-tenant crypto-shred); (3) regional ClickHouse clusters + tenant residency routing; (4) tenant-partitioned tables + dynamic TTL + documented erasure runbook + erasure audit table; (5) data classification, SSO+MFA+tenant-scoped RBAC, encryption in transit/rest, immutable audit logs, Confidentiality+Privacy in SOC 2.

**Nice to have:** reversible deterministic tokenization mode (premium); ClickHouse Cloud TDE/CMEK defense-in-depth; global control plane + regionalized data plane (selective residency).

**Flagged:** Presidio recall not guaranteed; source-code redaction harder than personal PII; CMEK crypto-shred is service-wide not per-tenant; SOC 2 sources don't name a "tenant isolation" control; CMEK 5–15% penalty + EU region availability are vendor-stated; several how-to sources (oneuptime, nocql.dev, martinuke0) are 2026 practitioner blogs — corroborate ClickHouse mechanics against official docs (DELETE/CMEK/regions claims are backed by clickhouse.com).

### Sources (area 3)
- [Microsoft Presidio](https://github.com/microsoft/presidio); [explainx.ai guide, 2026](https://explainx.ai/blog/microsoft-presidio-pii-detection-anonymization-guide-2026); [ijaibdcms, 2025](https://ijaibdcms.org/index.php/ijaibdcms/article/view/339)
- [oneuptime LLMOps PII, 2026-01-30](https://oneuptime.com/blog/post/2026-01-30-llmops-pii-detection/view); [truefoundry gateway vs app](https://www.truefoundry.com/blog/pii-redaction-llm-gateway-vs-application)
- [Langfuse masking](https://langfuse.com/docs/observability/features/masking); [GitHub discussion #9264](https://github.com/orgs/langfuse/discussions/9264)
- [Arize Phoenix](https://arize.com/phoenix/) / [GitHub](https://github.com/arize-ai/phoenix); [Helicone platform guide, 2025](https://www.helicone.ai/blog/the-complete-guide-to-LLM-observability-platforms)
- [LiteLLM Presidio tutorial](https://docs.litellm.ai/docs/tutorials/presidio_pii_masking); [PII v2](https://docs.litellm.ai/docs/proxy/guardrails/pii_masking_v2)
- [Red Gate 5 techniques](https://www.red-gate.com/simple-talk/data-security-privacy-compliance/how-to-anonymize-pii-in-llm-pipelines-5-key-techniques-explained/); [pctechmag, 2026-06](https://pctechmag.com/2026/06/pii-redaction-for-llms-in-2026-how-to-strip-sensitive-data-before-it-leaves-your-perimeter/); [Protecto, 2025](https://medium.com/@protectoai/unlocking-llm-privacy-strategic-approaches-for-2025-d1af6a34e9d1)
- [AWS multi-tenant KMS, 2025-08](https://aws.amazon.com/blogs/architecture/simplify-multi-tenant-encryption-with-a-cost-conscious-aws-kms-key-strategy/); [Google Cloud envelope/crypto-shred](https://medium.com/google-cloud/encryption-key-control-in-saas-deployments-fd67e8bc6af5); [oneuptime crypto-shredding, 2026-02](https://oneuptime.com/blog/post/2026-02-17-how-to-set-up-crypto-shredding-for-gdpr-right-to-erasure-compliance-in-google-cloud/view); [awssome](https://www.awssome.io/blog/multi-tenant-saas-security-encryption-faqs)
- [Altinity disk encryption KB](https://kb.altinity.com/altinity-kb-setup-and-maintenance/disk_encryption/); [ClickHouse issue #78223](https://github.com/ClickHouse/ClickHouse/issues/78223); [oneuptime column-level, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-column-level-encryption-functions/view); [ClickHouse CMEK](https://clickhouse.com/docs/cloud/security/cmek)
- [ClickHouse multi-region, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-cloud-multi-region-deployments/view); [supported regions](https://clickhouse.com/docs/cloud/reference/supported-regions); [WorkOS data residency](https://workos.com/blog/data-residency-for-enterprise-saas); [AWS EMEA framework](https://aws.amazon.com/blogs/publicsector/framework-for-platform-expansion-to-europe-middle-east-and-beyond/); [martinuke0, 2026-03-16](https://martinuke0.github.io/posts/2026-03-16-mastering-multi-tenant-data-isolation-strategies-for-scalable-cloud-infrastructure-and-saas-applications/)
- [oneuptime GDPR erasure, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-gdpr-right-to-erasure/view); [mutations vs lightweight deletes, 2026-03-31](https://oneuptime.com/blog/post/2026-03-31-clickhouse-mutations-vs-lightweight-deletes/view); [ClickHouse DELETE](https://clickhouse.com/docs/sql-reference/statements/delete); [nocql.dev dynamic TTL](https://nocql.dev/posts/clickhouse-dynamic-ttl/)
- [Secureframe TSC 2025](https://secureframe.com/hub/soc-2/trust-services-criteria); [Schellman](https://www.schellman.com/blog/soc-examinations/soc-2-trust-services-criteria-with-tsc); [Drata](https://drata.com/learn/soc-2/trust-services-criteria)

---

## 4. Production eval & quality-drift

### Convergent industry pattern (LangSmith, Braintrust, Arize/Phoenix all agree)
1. **Offline evals** — evaluators vs curated datasets/golden examples during dev, as a CI gate (deterministic, cheap).
2. **Online evals** — same evaluators run **async on sampled live traces**, no ground truth, using **reference-free LLM-as-judge** + heuristics (hallucination, tool-call accuracy, goal completion, tone), to detect drift (no added latency).
3. **Feedback loop** — failing production traces get pulled into datasets, become permanent golden cases.

Toqar already ingests the raw material (LLM calls, tool calls, handoff/override, feedback); the gap is the **scoring, versioning, and linkage layer** on top of ClickHouse. [LangSmith Evaluation](https://docs.langchain.com/langsmith/evaluation); [Braintrust how-to-eval, 2026-05-16](https://www.braintrust.dev/articles/how-to-eval); [Phoenix Evaluation](https://arize.com/docs/phoenix/evaluation/llm-evals); [Arize AX drift](https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/drift-tracing).

### LLM-as-judge
- Clear rubrics + explicit good/bad examples + captured chain-of-thought; **judge model must differ from task model**. Pre-built scorer libs (Braintrust `autoevals`, LangChain `openevals`, Phoenix `phoenix-evals`). Calibration is now first-class: LangSmith **Align Evals** collects human corrections, tracks judge-vs-human agreement over time; industry floor is **~80% agreement** (Braintrust recalibrates below it; LangChain cites ~85% judge/human alignment vs ~81% inter-human across 250k+ annotated cases). **Evals are themselves traced** (Phoenix writes each evaluator run via OTel — input data, exact judge prompt, full reasoning, scores, timing). Copy this pattern. [LangChain LLM-as-a-judge](https://www.langchain.com/resources/llm-as-a-judge).
- **Sampling live traces**: start scoring all requests, then reduce based on stability/traffic (Braintrust); LangSmith exposes filters + sampling rates on online evaluators; Phoenix/Arize AX runs online evals on a ~5-minute cadence with alerting.

### Human-in-the-loop / edit-distance (Toqar's differentiator)
- Vendors use annotation queues (row assignment, per-assignee queues, kanban triage backlog→pending→complete), span-level feedback (structured scores + free-text + categorical labels on individual tool calls/spans), thumbs up/down flowing into the same datasets; human-reviewed failures become permanent eval cases; judge-vs-human disagreement surfaced directly. [Braintrust HITL platforms 2026, Apr 3](https://www.braintrust.dev/articles/best-human-in-the-loop-llm-evaluation-platforms-2026); [Keymakr 2025](https://keymakr.com/blog/complete-guide-to-llm-data-annotation-best-practices-for-2025/).
- **No vendor markets a literal "edit-distance" metric** — a gap/opportunity, not a copy target. Toqar's organic **override events** enable auto-derived signals others can't: **override rate** (fraction of outputs a human edited/replaced) per agent/prompt version/cohort; **edit magnitude** (token/char Levenshtein or semantic-embedding distance between agent draft and human-shipped output); **handoff rate / time-to-handoff** as task-success proxy.
- **Critical asymmetry** (anchoring bias, [ACL 2025 "Just Put a Human in the Loop?"](https://aclanthology.org/2025.findings-acl.1323/)): showing humans the model's suggestion inflates confidence and makes them defer. So edit *presence* is a strong negative signal; edit *absence* is a weak positive. Treat asymmetrically.

### Regression detection around prompt/model changes
- Two layers, in order: (1) **offline replay regression suite as CI gate** — rerun same prompts/traces/datasets with fixed evaluator thresholds after *every* prompt/model/retriever/tool change (fast, cheap, deterministic safety net); (2) **online A/B on live traffic** — which version users actually prefer. **Parallel/shadow testing**: run old+new on identical traffic, compare **slice-level metrics not single replies** — the defense against silent vendor model updates. [Statsig, 2025-10-31](https://www.statsig.com/perspectives/slug-prompt-regression-testing).
- Statistical rigor for non-determinism: test **slices/distributions** not individual outputs (segment by cohort/content category); repeated trials to build score distributions; tolerance bands not exact-match; fix seeds where the API allows; ~500–2,000 sessions/variant. Drift stats: **PSI, Kolmogorov-Smirnov, KL divergence, Jensen-Shannon**; embedding-space drift via UMAP; rolling mean judge-score segmented by use case.
- **Agent-critical**: evaluating only final output passes **20–40% more test cases** than full-**trajectory** evaluation reveals (a model update at step 3 corrupts steps 4–8 invisibly). **Toqar must evaluate at trace/trajectory level** — directly aligned with its per-span ingestion, and a defensible differentiator vs output-only tools.
- **Versioning**: prompt versions, model versions, experiment IDs, and feature flags all tied to each trace so rollouts are reversible and drift is attributable. [Augment agent eval 2026](https://www.augmentcode.com/tools/best-ai-agent-evaluation-tools); [Latitude LLM eval 2026](https://latitude.so/blog/top-llm-evaluation-tools-ai-agents-2026-devto); [FutureAGI drift 2026](https://futureagi.com/blog/best-ai-drift-detection-tools-2026/); [StackPulsar model drift](https://stackpulsar.com/blog/llm-model-drift-detection/).

### Data you MUST persist (data-model implications)
Everything reduces to a **`(trace, version-tuple, evaluator-version, score)`** join, where version-tuple = `{prompt_version, model_version, agent_version, dataset_version}` **captured at score time** (missing this makes all drift comparisons uninterpretable — the single most common failure mode).

**MUST HAVE:**
| Entity | Why | ClickHouse note |
|---|---|---|
| Eval score (value/label + reasoning + judge raw output + latency) | Core artifact, enables drift math | Append-only high-cardinality → fits CH |
| Evaluator version (id + rubric hash + judge model) | A rubric change silently shifts all scores | Version every scorer; hash the rubric |
| Prompt version (id/hash, content, template) | Attribute drift to prompt changes | Immutable, content-addressed |
| Model version (provider, id, params, incl. detected silent updates) | Attribute drift to model changes | Capture on every trace |
| Trace ↔ eval-run linkage | Every score points to exact span/trace + eval run | FKs `trace_id`/`span_id` ↔ `eval_run_id` |
| Human feedback/annotations (span-level scores, labels, free-text, thumbs) | Human ground-truth; feeds calibration/datasets | Link to trace/span + `annotator_id` |
| Override/edit signal (original output, human-shipped output, computed edit distance, handoff flag) | Toqar's differentiating quality signal | Store both texts + precomputed distance |
| Dataset/golden examples (versioned, expected outputs/labels) | Offline regression + backtesting | Version datasets; track membership |
| Experiment/run metadata (variant, feature flag, experiment id, git/CI ref) | A/B + regression attribution | Tie to trace + version tuple |

**NICE TO HAVE:** embeddings of inputs/outputs (embedding-drift/UMAP + semantic edit-distance; storage-heavy); judge-vs-human agreement metrics over time; slice/segment definitions as first-class objects; alert/threshold config + tolerance bands per metric/slice; annotation-queue state (assignee, kanban) if Toqar builds its own review UI.

Scores are append-only high-cardinality time-series → ideal ClickHouse fit; versioned entities (prompts, evaluators, datasets) are lower-volume relational (small metadata store or CH dictionaries keyed by hash). Multi-tenant: partition/shard by tenant; tenant-scope evaluator/prompt version namespaces. Treat **evals as first-class traces themselves** (Phoenix pattern) so judge cost/latency/reasoning are observable.

### Recommendations (area 4)
**Must have (MVP):** (1) online LLM-as-judge scorers on sampled production traces, async, append-only eval-score rows linked to `trace_id` (start 100% sampling, add per-tenant config); (2) **full version-tuple capture at score time** (non-negotiable); (3) **trajectory-level evaluation** (leverage per-span ingestion — defensible differentiator); (4) **override/edit-distance metric** on existing handoff/override events (override rate + edit magnitude per version/cohort); (5) offline regression suite (golden/failing traces, rerun on prompt/model change, tolerance-band thresholds, CI-gate API); (6) statistical drift detection on eval-score distributions (PSI/KS/KL) segmented by slice, with alerting.

**Nice to have (later):** judge calibration loop (track agreement, alert <~80%); embedding-space drift (UMAP) + semantic edit-distance; annotation-queue UI (kanban/assignment); shadow/parallel A/B testing harness.

**Tradeoffs:** LLM-as-judge cost vs coverage (sampling is the lever; judge model choice matters); never ship judge scores without a human-calibration story (80% agreement floor); reference-free online scores are directional not absolute (pair with offline golden-set); override signal asymmetry (presence strong negative, absence weak positive).

**Flagged:** no vendor ships a literal edit-distance metric (opportunity, unvalidated against a shipping product); **no authoritative ClickHouse-as-eval-store reference architecture found** — the CH-fit argument is inference from workload shape (append-only high-cardinality time-series), not a cited best practice; the ~5-min Arize cadence is approximate; the 85% judge-alignment / 20–40% trajectory-gap / 500–2,000-sessions figures come from vendor/blog sources, not peer-reviewed studies.

### Sources (area 4)
- [LangSmith Evaluation docs](https://docs.langchain.com/langsmith/evaluation); [Braintrust — How to eval, 2026-05-16](https://www.braintrust.dev/articles/how-to-eval); [LangChain LLM-as-a-judge](https://www.langchain.com/resources/llm-as-a-judge)
- [Phoenix Evaluation docs](https://arize.com/docs/phoenix/evaluation/llm-evals); [Arize AX drift tracing](https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/drift-tracing)
- [Braintrust — best human-in-the-loop platforms 2026, Apr 3](https://www.braintrust.dev/articles/best-human-in-the-loop-llm-evaluation-platforms-2026); [ACL 2025 — LLM-Assisted Annotation](https://aclanthology.org/2025.findings-acl.1323/); [Keymakr 2025](https://keymakr.com/blog/complete-guide-to-llm-data-annotation-best-practices-for-2025/)
- [Statsig — Prompt regression testing, 2025-10-31](https://www.statsig.com/perspectives/slug-prompt-regression-testing); [Augment Code — best agent eval tools 2026](https://www.augmentcode.com/tools/best-ai-agent-evaluation-tools); [Latitude — top LLM eval tools 2026](https://latitude.so/blog/top-llm-evaluation-tools-ai-agents-2026-devto); [FutureAGI — drift detection 2026](https://futureagi.com/blog/best-ai-drift-detection-tools-2026/); [StackPulsar — LLM model drift](https://stackpulsar.com/blog/llm-model-drift-detection/)

---

## Consolidated "must have for trust/compliance" vs "nice to have"

**Must have (trust/compliance/correctness floor):**
1. Ingest `gen_ai.*` over OTLP but normalize to a stable internal schema (shield from Development-stage churn).
2. Wide denormalized span-first ClickHouse table, `ORDER BY (tenant_id, date, …)`, bloom index + companion trace-id table.
3. Blob(S3)/metadata(ClickHouse) split; TTL tiering; per-tenant retention.
4. Redaction at ingest (Presidio, all span types, secrets recognizer for source code).
5. Envelope encryption with app-managed per-tenant DEKs (enables single-tenant crypto-shred).
6. Regional ClickHouse clusters + tenant residency routing.
7. Tenant-partitioned tables + dynamic TTL + documented erasure runbook + erasure audit table.
8. Data classification, SSO+MFA+tenant-scoped RBAC, encryption in transit/rest, immutable audit logs; SOC 2 Confidentiality + Privacy.
9. Effective-dated pricing table, mutually-exclusive token buckets, cost snapshotted at ingest, `cost_source` flag.
10. Full eval version-tuple capture at score time; evals-as-traces; trajectory-level evaluation.

**Nice to have (differentiation):** dotted_order path; content-dedup blobs; reversible tokenization (premium); override/edit-distance quality signal; judge calibration loop; embedding-drift; annotation-queue UI; A/B shadow harness; cache-ratio + cost/score alerting.

---

**Note on provenance:** synthesized from four parallel web-research passes; all source URLs and dates are inline above. The most load-bearing single external reference is Langfuse's ClickHouse re-architecture (2026-03-10) since Langfuse is Toqar's closest analog — but note Langfuse was acquired by ClickHouse (~Jan 2026), so weight its "neutral" framing accordingly.
