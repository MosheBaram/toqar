# Erasure Runbook (right-to-be-forgotten — spec: data-governance)

Every erasure starts with a recorded request and ends with a recorded
completion (`erasure_audit`, owner-only, survives the tenant).

## Full tenant offboarding

1. `operators.requestErasure(operator, tenantId, 'tenant')` → erasure id.
2. Analytics: `deleteTenantEvents(ch, tenantId)` — lightweight deletes on
   `toqar.events` + `toqar.daily_rollups` (immediately invisible).
3. Payloads: `store.cryptoShredTenant(tenantId, operator)` — destroys the
   tenant's DEK; encrypted payloads (seam maps/source context) are
   permanently unreadable. Instant, provable, single-tenant.
4. `operators.completeErasure(operator, id, { events_deleted: true, crypto_shredded: true })`.
5. Control-plane rows (audit, billing records) are retained — accountability
   and legal-basis records, stated in the DPA.

## Single end-user (GDPR Art. 17)

1. `operators.requestErasure(operator, tenantId, 'end_user', sessionId)`.
2. `deleteEndUserEvents(ch, tenantId, sessionId)` — immediately invisible.
3. `operators.completeErasure(...)`.

## Scheduled physical removal

Lightweight deletes remove rows from query results immediately; disk
reclamation happens at merge. Run `purgeDeletedRows(ch)` on the erasure
schedule (weekly) — it forces the merges. Verify with a count on the
erased predicate before closing the request.

**Backups caveat**: crypto-shred is only complete if no plaintext copies
exist in backups. Analytics backups contain only redacted/ciphertext
payloads by construction; the KEK/DEK table backup retention must not
exceed the erasure SLA (deployment setting — see the pipeline README).
