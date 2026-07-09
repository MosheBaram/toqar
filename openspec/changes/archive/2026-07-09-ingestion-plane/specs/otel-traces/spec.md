# otel-traces Specification

## ADDED Requirements

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
