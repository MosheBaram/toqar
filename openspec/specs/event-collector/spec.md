# event-collector Specification

## Purpose

Authenticated, validating event and trace intake with per-tenant
rejection accounting and buffered, spike-tolerant publishing.

## Requirements

### Requirement: Authenticated, validating intake

`POST /v1/events` SHALL require a tenant bearer token and accept batches of events, validating each against `toqarEventSchema` (product-specific events validate against the envelope plus snake_case naming). Valid events are accepted 202; invalid ones are rejected per-item with reasons in the response.

#### Scenario: Mixed batch

- **WHEN** a batch contains 9 valid events and 1 with an unknown enum value
- **THEN** the response reports 9 accepted and 1 rejected with its validation issues, and only the 9 reach the stream

### Requirement: Rejects are recorded, never silent

Every rejected event SHALL be counted per tenant with its reason class, queryable by operators. Silent drops are forbidden.

#### Scenario: Rejection visible

- **WHEN** a tenant's SDK sends malformed events for an hour
- **THEN** the tenant's rejection counters show the volume and reason classes for that window

### Requirement: Buffered, spike-tolerant publishing

Accepted events SHALL publish to the stream with local buffering so short broker unavailability does not lose accepted events or block intake.

#### Scenario: Broker blip

- **WHEN** Redpanda is unavailable for 30 seconds under load
- **THEN** intake keeps answering 202 within its buffer capacity and buffered events publish when the broker returns

### Requirement: Truthful health

`GET /health` SHALL report broker connectivity truthfully.

#### Scenario: Degraded broker

- **WHEN** the broker is unreachable and buffers are filling
- **THEN** health reports degraded state, not ok
