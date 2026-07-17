# data-governance Specification

## Purpose

The trust/compliance floor for holding customer source code and agent
traces: redaction at ingest, per-tenant envelope encryption and
crypto-shredding, right-to-be-forgotten erasure with an audit trail, and
data-residency routing.

## Requirements

### Requirement: Redaction at ingest across every span type

Sensitive data SHALL be redacted before it is persisted to the analytics store, applied to every span/observation type (user input, retrieved/RAG context, tool results, model output) — not just the top-level prompt. Redaction SHALL include a source-code secrets/credentials recognizer distinct from personal-PII recognizers. Redaction SHALL be documented as best-effort (no recall guarantee); the product SHALL NOT claim redaction is absolute. Retaining un-redacted content SHALL require an explicit per-tenant opt-in.

#### Scenario: PII and secrets are redacted before storage

- **WHEN** a trace containing an email and an API key flows through ingest for a tenant without un-redacted opt-in
- **THEN** the persisted rows contain redacted placeholders, not the raw email or key, across all span types

#### Scenario: Redaction is described honestly

- **WHEN** redaction behavior is documented or surfaced to a customer
- **THEN** it states redaction is best-effort (no recall guarantee), never "guaranteed" or "complete"

### Requirement: Per-tenant envelope encryption and crypto-shredding

The most sensitive payloads (raw or tokenized prompts, source-code snippets, and any token-mapping vault) SHALL be encrypted with a per-tenant, application-managed data encryption key (DEK) wrapped by a KMS-held key. Destroying a tenant's key SHALL render that tenant's encrypted data unreadable (crypto-shredding) without affecting other tenants. Encryption SHALL be applied selectively — never to fields the query path must filter or aggregate on.

#### Scenario: A tenant's key destruction shreds only its data

- **WHEN** a tenant's DEK is destroyed
- **THEN** that tenant's encrypted payloads become unreadable and no other tenant's data is affected

### Requirement: Right-to-be-forgotten erasure with an audit trail

The analytics store SHALL support erasure without relying on per-request heavy mutations: tenant/time partitioning so full-tenant offboarding is a partition drop (or crypto-shred), and per-end-user erasure via an immediate logical delete plus scheduled physical removal. Every erasure request SHALL be recorded in an erasure audit table from request to completion.

#### Scenario: A tenant is fully erased

- **WHEN** a tenant offboards and requests erasure
- **THEN** its analytics data is removed (partition drop or crypto-shred), and the erasure audit table records the request and its completion

#### Scenario: An end-user is forgotten

- **WHEN** an end-user right-to-be-forgotten request is processed
- **THEN** that user's rows become immediately invisible and are physically removed on the next scheduled pass, with an audit record

### Requirement: Data-residency routing

Each tenant SHALL carry a residency designation that deterministically routes its ingest and queries to the correct regional data-plane cluster, so a tenant's personal data does not leave its region. The global control plane SHALL hold only non-personal metadata.

#### Scenario: EU tenant data stays in-region

- **WHEN** an EU-designated tenant's events are ingested and queried
- **THEN** they are stored in and served from the EU regional cluster, and no personal data is written to another region
