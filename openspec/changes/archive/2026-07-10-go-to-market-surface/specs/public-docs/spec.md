# public-docs Specification

## ADDED Requirements

### Requirement: Publishable docs site anchored on the schema spec

`apps/docs` SHALL build a static, publishable site whose anchor artifact is the TOQAR schema spec (`packages/registry/README.md`), plus product docs (SDK, OTLP, MCP, onboarding). It SHALL claim only implemented, verified behavior — the anti-slop rule extends to public docs.

#### Scenario: Docs match the code

- **WHEN** the docs describe an event, metric, or API
- **THEN** that thing exists in the shipped packages (a docs check cross-references names against the registry and semantic-layer catalog)

### Requirement: The TOQAR content series

The site SHALL host the category-creation content — one post per TOQAR layer (T/O/Q/A/R) — as the content-strategy artifact. Posts reference real metric definitions, not invented numbers.

#### Scenario: A layer post is grounded

- **WHEN** the Operational Efficiency post cites Cost per Completed Task
- **THEN** it uses the metric's real definition from the semantic layer, with no fabricated benchmark figures

### Requirement: Build is verified in CI

The docs site SHALL build in CI and its cross-reference check SHALL fail the build on a claim with no backing code.

#### Scenario: Aspirational doc blocked

- **WHEN** a doc references a non-existent event or metric
- **THEN** the docs build fails
