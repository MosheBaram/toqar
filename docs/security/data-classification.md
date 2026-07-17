# Data Classification (spec: security-controls)

Three tiers; the tier determines which controls apply. Every new field or
payload gets a tier at design time.

| Tier | Examples | Controls |
| --- | --- | --- |
| **Source context** (most restricted) | Seam maps (repo structure + code locations), anything derived from reading a customer repo | Envelope-encrypted at rest with the tenant's DEK (`crypto.ts`); crypto-shreddable per tenant; **reads audited** (`audit_log`, `seam_map`/read); never leaves the control plane |
| **PII-bearing traces** | Event property strings: tool errors, model output refs, user-originated text | Redacted at ingest by default (PII + secrets recognizers, `packages/collector/src/redact.ts`); un-redacted retention is an explicit audited per-tenant opt-in; per-tenant retention TTL + right-to-be-forgotten deletion; residency-routed |
| **Non-personal metadata** | Event names, task types, counters, metric values, registry entries, audit records | Tenant-scoped (app WHERE + RLS on the served path); no encryption/redaction needed; retained for reproducibility (citations) |

Rules of thumb:
- A field the query path filters or aggregates on cannot be in an encrypted
  tier — reclassify or restructure.
- Redaction is best-effort pattern matching (no recall guarantee) — the
  honest wording is part of the product, never "guaranteed".
- Erasure records (`erasure_audit`) outlive the data they erase — that is
  deliberate and required for accountability.
