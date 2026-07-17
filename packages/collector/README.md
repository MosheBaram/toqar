# @toqar/collector

Authenticated, validating event intake. Two ingress paths land in one
buffered sink that rides broker outages:

1. **TOQAR events** — `POST /v1/events`, per-item `202` semantics with
   rejection accounting (a bad item never fails the batch; it's counted).
2. **OTLP/HTTP traces** — `POST /v1/traces`, OpenTelemetry spans mapped to
   TOQAR events by the versioned convention in `otel.ts`.

Fastify. Every request is tenant-scoped by its bearer token; tenant ids
never appear in URLs.

## Dependencies

| Package | Why |
| --- | --- |
| `@toqar/registry` | Event/envelope schemas (`toqarEventSchema`, `eventEnvelopeSchema`), `TOQAR_EVENT_NAMES`, `SCHEMA_VERSION` for validation and OTLP mapping. |
| `@toqar/registry-service` | `RegistryStore` / `SqlExecutor` for tenant-token auth against the same backend the registry uses. |

## OTLP → TOQAR mapping

Versioned in `otel.ts` (`OTEL_MAPPING_VERSION`) — mapping changes alter what
events exist, so the version bumps when semantics move:

- GenAI spans (OTel GenAI semconv `gen_ai.*`) → `step_executed` `llm_call`
- Tool spans (`toqar.tool.name` / `gen_ai.tool.name`) → `step_executed` `tool_call`
- Root spans with `toqar.outcome` → `task_started` + `task_{completed,failed,abandoned}`
- task/run ids from `toqar.task_id` / `toqar.run_id`, falling back to the trace id
- agent name from resource `service.name`

## Buffering

Accepted events go to a `BufferedSink` wrapping the stream sink. When the
broker is unavailable the buffer absorbs the spike and the sink reports
degraded — intake stays up. `/health` surfaces the broker state and buffer
depth truthfully.

## Tests

```bash
pnpm --filter @toqar/collector test   # unit: app, OTLP mapping, traces route
```

The collector's own tests are unit-level (validation, mapping, per-item
`202` accounting) against an in-process registry and a null sink. Changes
under `packages/collector/**` also trigger the docker-compose integration
job (`.github/workflows/integration.yml`), where the end-to-end broker →
ClickHouse pipe is exercised by `@toqar/pipeline`'s integration test.

## Redaction at ingest (spec: data-governance)

Sensitive values are redacted **before** anything reaches the stream —
across every span type (event property strings, tool errors, OTLP-mapped
spans). Two recognizer classes: personal PII (email, phone, credit card
with Luhn verification, SSN, IP) and **source-code secrets** (cloud keys,
API tokens, private-key blocks, bearer headers) — a distinct class because
Toqar reads customers' repos. Structural analytics fields (event names,
ids, enums) are never touched.

**Honesty contract:** redaction is deterministic pattern matching —
best-effort with **no recall guarantee**; never present it as absolute.
Retaining un-redacted content requires an explicit per-tenant opt-in
(`RegistryStore.setRedactionOptout`, audited). The 202 response reports the
redaction count.
