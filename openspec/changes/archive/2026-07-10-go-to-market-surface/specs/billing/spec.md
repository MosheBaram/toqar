# billing Specification

## ADDED Requirements

### Requirement: Usage metering from real activity

Billing SHALL meter usage from actual system events — events ingested, tasks tracked, agent runs — computed from the same tenant-scoped data the product already stores. Metered numbers SHALL be reproducible from their source (a bill line resolves to a query, like every other number).

#### Scenario: Meter reconciles to source

- **WHEN** a billing period's event count is computed
- **THEN** it matches a direct tenant-scoped query over `toqar.events` for that window

### Requirement: Tiers anchored on willingness-to-pay data

The tier structure SHALL be defined in code (limits + prices) and SHALL start from the validation WTP evidence (`docs/validation/scorecard.md`). A tenant's tier and current usage against limits SHALL be readable.

#### Scenario: Usage against limit visible

- **WHEN** a tenant queries its plan
- **THEN** the response shows the tier, its limits, and current usage — no surprise overages

### Requirement: Payments via a provider, never bespoke

Payment handling SHALL integrate a payment provider (Stripe). Toqar SHALL NOT store card data or implement card flows; PCI scope stays with the provider.

#### Scenario: No card data in Toqar

- **WHEN** the billing code and storage are reviewed
- **THEN** no card numbers, CVVs, or raw payment credentials are present — only provider references (customer/subscription ids)

### Requirement: Metering is tenant-isolated and auditable

Usage records and invoices SHALL be tenant-scoped (RLS + audit like every other store) and SHALL register in the adversarial isolation suite.

#### Scenario: No cross-tenant billing data

- **WHEN** tenant A requests tenant B's usage or invoices
- **THEN** the API responds 404/403 and returns no tenant-B data
