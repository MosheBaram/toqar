# stream-pipeline Specification (delta)

## ADDED Requirements

### Requirement: Durable idempotent producer

The collector's Redpanda producer SHALL be configured for durability and idempotency: acknowledgements from all in-sync replicas (`acks=all`) and an idempotent producer so a producer-side retry cannot introduce a duplicate on the broker. Stream correctness SHALL NOT rest solely on downstream ClickHouse deduplication.

#### Scenario: Producer retry does not duplicate on the broker

- **WHEN** a produce request is retried after an ambiguous failure
- **THEN** the broker stores the record once (idempotent producer), acknowledged by all in-sync replicas

### Requirement: Effectively-once sink with a dead-letter path

The ClickHouse sink SHALL commit consumer offsets only after a batch is durably written, so a crash re-processes rather than skips (at-least-once into the dedup layer = effectively-once). Messages that cannot be mapped or inserted SHALL be routed to a dead-letter path with their reason — never silently dropped.

#### Scenario: Crash before commit re-processes, never skips

- **WHEN** the sink writes a batch to ClickHouse but crashes before committing the offset
- **THEN** on restart the batch is re-consumed and, via `event_id` dedup, appears once in query results

#### Scenario: Unmappable message is preserved

- **WHEN** a message cannot be mapped to a row or fails insertion
- **THEN** it is written to the dead-letter path with its failure reason (recoverable), and the count is observable

### Requirement: No acknowledged event is silently lost

Once the collector acknowledges an event (202), a sustained broker outage SHALL NOT silently discard it. Beyond the in-memory buffer, the collector SHALL either spill overflow durably (disk/DLQ for later replay) or stop acknowledging (backpressure) — counting drops is not sufficient for acknowledged data.

#### Scenario: Outage past buffer capacity does not discard acked events

- **WHEN** the broker is down long enough to exceed the collector's buffer capacity
- **THEN** further accepted events are durably spilled or ingestion signals backpressure instead of acknowledging-then-dropping, and previously acked events are eventually delivered

### Requirement: Topic retention and tiered storage

The events topic SHALL have an explicit retention policy and SHALL be deployable with tiered (object-storage) retention so the broker is not the long-term store and a spike or slow consumer cannot exhaust local disk.

#### Scenario: Retention is explicit and can tier to object storage

- **WHEN** the topic is provisioned for production
- **THEN** it has a defined retention window and can offload older segments to object storage
