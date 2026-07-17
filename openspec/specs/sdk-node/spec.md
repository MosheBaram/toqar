# sdk-node Specification

## Purpose

The customer-side event emitter: typed fire-and-forget functions over one
chokepoint, with batching, envelope completion, and a kill switch.

## Requirements

### Requirement: Typed emitters over one chokepoint

The SDK SHALL expose one typed function per TOQAR core event (signatures matching the event schemas) routing through a single `track()`; payloads SHALL validate against `toqarEventSchema` in development mode and be emitted envelope-complete (`event_id` UUID, `schema_version`, timestamp) always.

#### Scenario: Envelope completed automatically

- **WHEN** `analytics.taskCompleted(ctx, props)` is called
- **THEN** the emitted payload carries a fresh `event_id`, `SCHEMA_VERSION`, and an ISO timestamp without the caller providing them

### Requirement: Fire-and-forget with batching

Delivery SHALL never block or crash the host: events buffer in memory, flush in batches on size/interval, and drop with a local warning when the collector is unreachable. No retry storm, no unbounded queue.

#### Scenario: Collector down

- **WHEN** the collector is unreachable during a flush
- **THEN** the host application's control flow is unaffected and the batch is dropped with a warning after bounded retries

### Requirement: Kill switch

`TOQAR_ANALYTICS_DISABLED=1` SHALL make every emitter a no-op.

#### Scenario: Disabled

- **WHEN** the kill switch is set
- **THEN** no network calls are made and emitters return immediately

### Requirement: Framework auto-instrument wrappers

The SDK SHALL offer drop-in wrappers for the major LLM/agent frameworks (at minimum: the Anthropic and OpenAI SDKs, Vercel AI SDK, LangChain/LangGraph) that emit TOQAR events from existing application calls without manual `track()` calls — a zero-PR "first data in five minutes" path that complements (not replaces) the PR-based instrumentation agent. Wrappers preserve the SDK's guarantees: fire-and-forget, never block or crash the host, envelope completion, kill switch.

#### Scenario: Wrapping a client yields events without code changes elsewhere

- **WHEN** a customer wraps their LLM client with the Toqar wrapper and runs their existing agent
- **THEN** `step_executed` events (model, tokens, latency, status) flow to the collector with no other code modified, and a delivery failure never affects the host application

#### Scenario: Wrapper data upgrades to full instrumentation

- **WHEN** the instrumentation agent later opens its PR for the same app
- **THEN** wrapper-derived and plan-derived events share the same registry contract — no conflicting event definitions
