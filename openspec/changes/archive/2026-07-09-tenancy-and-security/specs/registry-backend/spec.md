# registry-backend Specification (delta)

## ADDED Requirements

### Requirement: Token management routes

The service SHALL support issuing additional tenant tokens with a scope (`events:write` | `api:full`), listing active tokens (prefixes only — never full values), and revoking a token by id. Every token operation appends to the audit trail.

#### Scenario: Issue, list, revoke

- **WHEN** a tenant issues a scoped token, lists tokens, and revokes the original
- **THEN** the list shows both by prefix and scope, the revoked token 401s immediately, and all three operations appear in the audit log
