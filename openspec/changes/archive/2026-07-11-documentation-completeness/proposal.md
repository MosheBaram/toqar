# Documentation Completeness

## Why

The platform is built (Phase 0/1/2 shipped and archived) but its internal documentation has gaps a new contributor hits immediately. Six packages have no README (`analysis-agent`, `cli`, `collector`, `isolation-suite`, `sdk`, and `apps/web`), there is no single architecture overview showing how the 14 packages + 2 apps fit together, and there is no dev-setup/contributor guide covering the toolchain, the Docker-backed integration tests, and the anti-slop gate. The public docs site (`apps/docs`) and the schema spec are covered by `public-docs`; this change is the *contributor-facing* counterpart. Same discipline applies: docs describe only what exists.

## What Changes

- Add a README to each of the six packages that lacks one: `packages/analysis-agent`, `packages/cli`, `packages/collector`, `packages/isolation-suite`, `packages/sdk`, `apps/web` — each stating what it does, its `@toqar/*` dependencies, and how it is used/tested.
- Add a root `ARCHITECTURE.md`: the package/app dependency graph (leaves → data plane → agents → apps), the control-plane vs. data-plane split, and the core invariants (tenant isolation, citation contract, deterministic numbers).
- Add a `CONTRIBUTING.md` dev-setup guide: prerequisites (Node 20, pnpm), install/build/test, running the Docker-compose integration suite, and the anti-slop gate contributors must pass.
- Extend the CI docs cross-reference discipline so the new contributor docs cannot drift: package names, dependency claims, and referenced scripts are checked against the workspace.

## Capabilities

### New Capabilities

- `contributor-docs` — internal documentation completeness: every package/app has a README, a root architecture overview exists, a contributor setup guide exists, and all of it is drift-checked against the actual workspace.

## Impact

- Docs and one CI check only; **no product code changes**. Purely additive.
- Depends on the shipped Phase 0/1/2 tree. The dependency graph in `ARCHITECTURE.md` is drawn from the real `@toqar/*` dependencies, not an idealized design.
- Reinforces the anti-slop rule at the contributor boundary: the drift check fails the build if a README claims a dependency or script the workspace does not have.
