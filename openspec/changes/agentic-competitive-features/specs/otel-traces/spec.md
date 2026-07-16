# otel-traces Specification (delta)

## ADDED Requirements

### Requirement: Stable OTel GenAI client-span import

The OTLP endpoint SHALL ingest spans following the now-stable OTel GenAI client-span conventions (`gen_ai.provider.name`, `gen_ai.request.model` / `response.model`, `gen_ai.usage.input_tokens` / `output_tokens`, `gen_ai.operation.name`, finish reasons), normalizing them into the internal schema at ingest — pinned to a semconv version so upstream churn cannot silently change what events exist. Agent-layer semantics (task success, takeover, autonomy) remain Toqar's own versioned superset, since the spec's agent layer is still experimental; the mapping version bumps when semantics move, as today.

#### Scenario: An OpenLLMetry-instrumented app lands without a custom SDK

- **WHEN** an application instrumented with a standard OTel GenAI library exports spans to the collector
- **THEN** its LLM calls appear as TOQAR `step_executed` events with model, tokens, and latency populated from the `gen_ai.*` attributes, under the pinned mapping version

#### Scenario: Semconv churn cannot silently change events

- **WHEN** an emitter sends attributes from a newer semconv than the pinned mapping supports
- **THEN** unknown attributes are preserved in the payload without altering mapped semantics, and unmapped spans are counted, never silently dropped
