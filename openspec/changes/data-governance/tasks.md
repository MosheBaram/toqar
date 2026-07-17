# Tasks — Data Governance

> Trust/compliance floor for holding customer source code + agent traces.
> Grounded in `docs/research/2026-07-16-agent-governance.md`. Coordinates with
> `data-plane-hardening` on shared partitioning/TTL/deletion. Each group ships
> through branch → PR → CI → merge.

## 1. Redaction at ingest (spec: data-governance)

- [x] 1.1 Redaction stage in the collector/ingest path (before ClickHouse): deterministic pattern recognizers over every span type (PII: email/phone/Luhn-verified card/SSN/IP) + a distinct source-code secrets class (cloud keys, API tokens, PEM blocks, bearer headers); TDD email/key/secret cases redacted *(NER/LLM secondary pass deferred — recorded as best-effort per the spec honesty contract)*
- [x] 1.2 Per-tenant un-redacted-retention opt-in (explicit, audited); default is redact
- [x] 1.3 Honest documentation: redaction is best-effort (no recall guarantee) — surfaced in docs and any customer-facing copy
- [x] 1.4 Commit, PR, merge

## 2. Envelope encryption + crypto-shredding (spec: data-governance)

- [x] 2.1 Per-tenant DEK (KMS-wrapped) management in the control plane; selective column/payload encryption for sensitive fields (never filterable fields); TDD encrypt/decrypt roundtrip
- [x] 2.2 Crypto-shred path: destroy a tenant DEK → its payloads unreadable, others unaffected; TDD
- [x] 2.3 Commit, PR, merge

## 3. GDPR erasure + audit (spec: data-governance)

- [x] 3.1 Full-tenant erasure via crypto-shred + lightweight delete (partitions are time-keyed monthly per analytics-storage, so the spec's "or crypto-shred" arm is the mechanism); TDD tenant vanishes from all queries/rollups (dp-hardening group 3) and shred is single-tenant (crypto tests)
- [x] 3.2 Per-end-user erasure: immediate logical delete + scheduled physical removal (no per-request heavy mutation)
- [x] 3.3 Erasure audit table (request → completion) in the control plane
- [x] 3.4 Commit, PR, merge

## 4. Data residency (spec: data-governance)

- [x] 4.1 Residency tag on the tenant record; deterministic ingest/query routing to the regional cluster; control plane holds only non-personal metadata
- [x] 4.2 TDD: an EU-tagged tenant routes to the EU cluster deterministically (router unit tests; multi-region cluster provisioning is deployment/operator-gated)
- [x] 4.3 Commit, PR, merge

## 5. Compliance posture (spec: security-controls delta) + close-out

- [x] 5.1 Data-classification scheme (source code / PII-traces / metadata tiers) driving redaction/encryption; immutable sensitive-data access audit extending existing trails
- [x] 5.2 SOC 2 Confidentiality + Privacy control mapping in `docs/security/`; erasure + crypto-shred runbook
- [x] 5.3 `openspec validate --strict`; full gates green; commit, PR, merge
