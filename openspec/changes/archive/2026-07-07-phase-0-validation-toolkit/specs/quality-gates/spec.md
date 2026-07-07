# quality-gates Specification

## ADDED Requirements

### Requirement: CI verifies every push and pull request

A GitHub Actions workflow SHALL run on every push to `main` and every pull request, executing `pnpm install`, `pnpm typecheck`, and `pnpm test` on Node 20. A red workflow means the commit violates the "every commit typechecks and passes tests" constraint.

#### Scenario: Failing typecheck blocks

- **WHEN** a commit introduces a TypeScript error in any workspace package
- **THEN** the CI workflow fails

#### Scenario: Green pipeline

- **WHEN** a commit typechecks and all tests pass
- **THEN** the CI workflow succeeds

### Requirement: Anti-slop static gate

CI SHALL fail if product code contains fake-data or placeholder patterns: `Math.random(` or mock/placeholder markers (e.g. "mock for now", "TODO: real implementation") outside `*.test.ts` files, `fixtures/`, and clearly marked seed scripts. A metric either computes from real data or does not exist.

#### Scenario: Fake data rejected

- **WHEN** `Math.random(` appears in `packages/registry/src/` outside a `*.test.ts` file
- **THEN** the anti-slop check fails the CI run

#### Scenario: Test code exempt

- **WHEN** `Math.random(` appears only in `*.test.ts` files or `fixtures/`
- **THEN** the anti-slop check passes
