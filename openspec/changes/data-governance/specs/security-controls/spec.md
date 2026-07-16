# security-controls Specification (delta)

## ADDED Requirements

### Requirement: Data classification drives protection

The platform SHALL classify data into tiers — at minimum customer source code, PII-bearing traces, and non-personal metadata — and the classification SHALL determine which fields are redacted and encrypted. Source code SHALL be the most restricted tier.

#### Scenario: Classification governs handling

- **WHEN** a field is classified as source code or PII-bearing
- **THEN** it is subject to the redaction/encryption controls for its tier, and source-code access is more tightly scoped than aggregate metrics

### Requirement: Immutable access audit logging

Reads and administrative actions on sensitive data SHALL be recorded in an append-only, tamper-evident audit log (extending the existing per-tenant and operator audit trails to cover sensitive-data access), supporting the SOC 2 Confidentiality and Privacy criteria.

#### Scenario: Sensitive-data access is auditable

- **WHEN** source code or PII-bearing trace data is accessed
- **THEN** an immutable audit record identifies who accessed what and when
