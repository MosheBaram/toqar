# contributor-docs Specification

## Purpose

Internal documentation completeness: every workspace package and app has a
README, a root architecture overview exists, a contributor setup guide
exists, and all of it is drift-checked against the actual workspace so it
cannot rot — the anti-slop rule applied one directory up from `public-docs`.

## Requirements

### Requirement: Every package and app has a README

Each workspace package and app SHALL have a `README.md` stating what it does, its `@toqar/*` dependencies, and how it is used and tested.

#### Scenario: No package is undocumented

- **WHEN** the workspace is enumerated
- **THEN** every `packages/*` and `apps/*` directory contains a `README.md`

#### Scenario: A README is grounded

- **WHEN** a package README lists its dependencies
- **THEN** they match the `@toqar/*` dependencies in that package's `package.json` (no invented or omitted ones)

### Requirement: Architecture overview

A root `ARCHITECTURE.md` SHALL document how the packages and apps compose: the dependency layering (leaf packages → data plane → agents → apps), the control-plane vs. data-plane split, and the core cross-cutting invariants (per-tenant isolation, the citation/query-id contract, deterministic customer-facing numbers). It SHALL reflect the real dependency graph.

#### Scenario: The graph is real

- **WHEN** `ARCHITECTURE.md` states that package A depends on package B
- **THEN** that dependency exists in A's `package.json`

### Requirement: Contributor setup guide

A `CONTRIBUTING.md` SHALL let a new contributor go from clone to green: prerequisites (Node 20, pnpm), install/build/test, how to run the Docker-compose integration suite, and the anti-slop gate they must pass before committing.

#### Scenario: A newcomer can build and test

- **WHEN** a new contributor follows `CONTRIBUTING.md` on a clean checkout
- **THEN** the documented install/build/test commands are the ones the repo actually uses

### Requirement: Contributor docs are drift-checked in CI

A CI check SHALL verify the contributor docs against the workspace: every package/app has a README, dependency claims match `package.json`, and referenced scripts exist. The build SHALL fail when a doc drifts from reality.

#### Scenario: A stale dependency claim is caught

- **WHEN** a README claims a `@toqar/*` dependency the package no longer has
- **THEN** the docs check fails the build
