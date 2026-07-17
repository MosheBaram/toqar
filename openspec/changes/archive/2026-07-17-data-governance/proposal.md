# Data Governance

## Why

Toqar holds the most sensitive data a customer has: their source code (to
instrument it) and their agent traces (which carry prompts, tool I/O, and
end-user PII). Being "best in the world" for AI-native startups means being the
one they can trust with that — and enterprise buyers holding source context will
require it. Today the platform has strong tenant isolation but **no PII
redaction, no field-level encryption, no data-residency routing, and no
right-to-be-forgotten path** for the analytics store (the append-oriented
ClickHouse deletion gap is called out in `data-plane-hardening`). This change
builds the governance layer, grounded in `docs/research/2026-07-16-agent-governance.md`
(cited best practices, mid-2026).

## What Changes

- **Redaction at ingest (new capability `data-governance`).** PII/secret
  redaction before data lands in ClickHouse, over *every* span type (user input,
  retrieved context, tool results, model output), with a dedicated
  **source-code secrets recognizer** distinct from personal PII. Redaction is
  documented honestly as best-effort (no recall guarantee); un-redacted
  retention is an explicit per-tenant contractual opt-in.
- **Envelope encryption with per-tenant, app-managed DEKs** for the most
  sensitive payloads (raw/tokenized prompts, source snippets, any token-mapping
  vault) — the mechanism that makes **crypto-shredding** (instant, provable
  per-tenant erasure) possible. Encrypt selectively (never fields you filter on).
- **Right-to-be-forgotten / GDPR erasure** for the analytics store: tenant-and-
  time partitioning so tenant offboarding is a `DROP PARTITION`; per-end-user
  erasure via lightweight delete + scheduled physical removal; an **erasure
  audit table** (request → completion); crypto-shred as the primary full-tenant
  path. Avoid per-request heavy mutations.
- **Data residency**: regional data-plane clusters (EU/US) with a residency tag
  on the tenant record that deterministically routes ingest/query; a global
  control plane holding only non-personal metadata.
- **Compliance posture (modify `security-controls`).** A data-classification
  scheme (source code / PII-traces / metadata as distinct tiers driving which
  fields get redacted/encrypted), immutable access audit logging, and scoping
  **SOC 2 Confidentiality + Privacy** into the report.

## Capabilities

### New Capabilities

- `data-governance` — redaction-at-ingest, per-tenant envelope encryption +
  crypto-shredding, GDPR erasure with an audit trail, and data-residency
  routing for the sensitive data Toqar holds.

### Modified Capabilities

- `security-controls` — data classification, immutable audit logging, and SOC 2
  Confidentiality + Privacy scope for holding source context and traces.

## Impact

- Touches ingest (collector/pipeline), the ClickHouse schema (partitioning for
  erasure, encrypted columns), and the control plane (residency tag, DEK
  management, erasure audit). Coordinates with `data-plane-hardening` (shared
  partitioning/TTL/deletion mechanics) — that change owns efficiency; this one
  owns trust/compliance.
- Redaction changes what is stored, so it ships with the ingest path and is
  covered by the anti-slop honesty rule: estimated/uncertain redaction is never
  presented as guaranteed.
- Several items (regional clusters, CMEK, SOC 2 report) are deployment/audit
  gated; the code, schema, and runbooks are built here.
