<!-- claims: events=step_executed -->
# Data trust

Toqar holds sensitive data — agent traces and, to instrument you, an
understanding of your source code. The controls, honestly stated:

- **Redaction at ingest (default on).** Personal PII (emails, phone
  numbers, Luhn-verified card numbers, SSNs, IPs) and source-code secrets
  (cloud keys, API tokens, private-key blocks, bearer headers) are
  replaced before anything reaches storage, across every span type — tool
  errors on a `step_executed` included. Redaction is deterministic pattern
  matching: best-effort, **no recall guarantee**. Retaining un-redacted
  content requires an explicit, audited opt-in.
- **Per-tenant encryption + crypto-shredding.** Source context (seam maps)
  is encrypted at rest with your tenant's own key. Destroying that key
  makes your encrypted data permanently unreadable — instant, provable,
  and only yours.
- **Retention you control.** A per-tenant retention window (default 365
  days, audited setter) drives row-level TTL in the analytics store.
- **Right to be forgotten.** Full-tenant erasure and per-end-user erasure
  (immediately invisible, physically removed on the scheduled pass), each
  recorded in an erasure audit trail from request to completion.
- **Residency.** A per-tenant residency tag routes your events to the
  designated regional cluster deterministically. (Multi-region clusters
  are provisioned per deployment.)
- **Access audit.** Reads of source context are audited, not just writes;
  operator cross-tenant reads are separately audited and provably closed
  to tenant credentials by a standing adversarial test suite.
