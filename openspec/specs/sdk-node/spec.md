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
