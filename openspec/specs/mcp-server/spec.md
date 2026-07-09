# mcp-server Specification

## Purpose

The agent-native query surface: customers' own agents read metrics,
findings, and the registry over MCP — read-only, tenant-scoped, cited.

## Requirements

### Requirement: Tenant-scoped MCP server

An MCP server (official TypeScript SDK, no hand-rolled protocol) SHALL expose the tenant's analytics to MCP clients, authenticated with the tenant token; every response is scoped to that tenant by construction.

#### Scenario: Customer agent connects

- **WHEN** a customer configures the server in Claude Code with their token
- **THEN** tool listings and responses reflect only their tenant

### Requirement: Metrics, findings, and registry as tools

The server SHALL expose at minimum: `query_metric` (semantic-layer catalog metrics with window/segment parameters — returning the number *and* its query id), `list_findings` / `get_finding` (with evidence chains), and `get_registry` (entries with their identity-card fields).

#### Scenario: Metric via MCP carries citation

- **WHEN** a client calls `query_metric` for TSR over last week
- **THEN** the result includes the value, the window, and the query id — same citation contract as every other surface

### Requirement: No write tools in this change

The server SHALL be read-only: no tool mutates the registry, findings, or configuration. Write access arrives, if ever, behind the autonomy dial in a later change.

#### Scenario: Read-only surface

- **WHEN** the tool list is enumerated
- **THEN** it contains no mutating tools
