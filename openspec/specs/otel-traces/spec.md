# otel-traces Specification

## Purpose

OTLP-compatible trace intake mapped deterministically to TOQAR events
via versioned conventions; unmappable spans counted, never dropped.

## Requirements

### Requirement: OTLP-compatible trace intake

The collector SHALL accept OTLP/HTTP trace exports (standard OpenTelemetry SDK wire format) on a tenant-authenticated endpoint, so a customer instrumenting their agent with vanilla OTel needs no Toqar SDK.

#### Scenario: Vanilla OTel export accepted

- **WHEN** a customer's OTel SDK exports a trace batch with their tenant token
- **THEN** the endpoint accepts it and the spans enter the mapping pipeline

### Requirement: Spans map to TOQAR events

Trace spans SHALL map deterministically to TOQAR events using documented conventions: GenAI/LLM spans → `step_executed` (`step_type: llm_call`, model, tokens, latency), tool spans → `step_executed` (`tool_call`, tool name, status), root task spans with outcome attributes → `task_started`/`task_completed`/`task_failed`. Unmappable spans are counted per tenant, never silently discarded.

#### Scenario: LLM span becomes step_executed

- **WHEN** a span arrives with GenAI semantic-convention attributes (model, token counts) inside a task trace
- **THEN** a valid `step_executed` event lands in ClickHouse carrying that model, token, and latency data with the trace's task/run ids

#### Scenario: Unmappable span counted

- **WHEN** a span carries no recognized conventions
- **THEN** it increments the tenant's unmapped-span counter with a reason class

### Requirement: Stable OTel GenAI client-span import

The OTLP endpoint SHALL ingest spans following the now-stable OTel GenAI client-span conventions (`gen_ai.provider.name`, `gen_ai.request.model` / `response.model`, `gen_ai.usage.input_tokens` / `output_tokens`, `gen_ai.operation.name`, finish reasons), normalizing them into the internal schema at ingest — pinned to a semconv version so upstream churn cannot silently change what events exist. Agent-layer semantics (task success, takeover, autonomy) remain Toqar's own versioned superset, since the spec's agent layer is still experimental; the mapping version bumps when semantics move, as today.

#### Scenario: An OpenLLMetry-instrumented app lands without a custom SDK

- **WHEN** an application instrumented with a standard OTel GenAI library exports spans to the collector
- **THEN** its LLM calls appear as TOQAR `step_executed` events with model, tokens, and latency populated from the `gen_ai.*` attributes, under the pinned mapping version

#### Scenario: Semconv churn cannot silently change events

- **WHEN** an emitter sends attributes from a newer semconv than the pinned mapping supports
- **THEN** unknown attributes are preserved in the payload without altering mapped semantics, and unmapped spans are counted, never silently dropped
