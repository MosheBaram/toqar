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

- [ ] 3.1 Tenant/time partitioning so full-tenant erasure is a partition drop (or crypto-shred); TDD tenant vanishes from all queries/rollups
- [ ] 3.2 Per-end-user erasure: immediate logical delete + scheduled physical removal (no per-request heavy mutation)
- [ ] 3.3 Erasure audit table (request → completion) in the control plane
- [ ] 3.4 Commit, PR, merge

## 4. Data residency (spec: data-governance)

- [ ] 4.1 Residency tag on the tenant record; deterministic ingest/query routing to the regional cluster; control plane holds only non-personal metadata
- [ ] 4.2 TDD: an EU-tagged tenant's data is written/served only in-region
- [ ] 4.3 Commit, PR, merge

## 5. Compliance posture (spec: security-controls delta) + close-out

- [ ] 5.1 Data-classification scheme (source code / PII-traces / metadata tiers) driving redaction/encryption; immutable sensitive-data access audit extending existing trails
- [ ] 5.2 SOC 2 Confidentiality + Privacy control mapping in `docs/security/`; erasure + crypto-shred runbook
- [ ] 5.3 `openspec validate --strict`; full gates green; commit, PR, merge
