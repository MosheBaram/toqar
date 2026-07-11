# Contributing

Everything you need to go from a clone to a green build. For how the pieces
fit together, read `ARCHITECTURE.md` first.

## Prerequisites

- **Node.js 20** (the version CI uses).
- **pnpm** — this is a pnpm-workspaces monorepo. Install with
  `corepack enable` or per pnpm's docs.
- **Docker** (with `docker compose`) — only for the data-plane integration
  suite; the default `verify` build does not need it.

## Install, build, test

```bash
pnpm install          # install all workspace deps
pnpm build            # build every package (topological; dependents resolve
                      # each other's types from dist/)
pnpm typecheck        # tsc across the workspace
pnpm test             # vitest across the workspace
```

These four are exactly what the `verify` CI job runs, in this order. Build
before typecheck: workspace packages resolve each other's types from
`dist/`, so a stale or missing build breaks typechecking of dependents.

Scope to one package while iterating:

```bash
pnpm --filter @toqar/collector test
pnpm --filter @toqar/analysis-agent typecheck
```

## Integration suite (data plane)

The end-to-end broker → ClickHouse pipe runs against a real stack in
`infra/docker-compose.yml` (Redpanda + ClickHouse). It's a separate CI job
(`integration`) triggered by changes under the data-plane packages and
`infra/`.

```bash
docker compose -f infra/docker-compose.yml up -d --wait
pnpm install && pnpm build
TOQAR_INTEGRATION=1 pnpm --filter @toqar/pipeline test
docker compose -f infra/docker-compose.yml down -v
```

Without `TOQAR_INTEGRATION=1` the pipeline's integration test is skipped, so
the standard `pnpm test` stays fast and Docker-free.

## The anti-slop gate

Every change must pass the anti-slop check — the platform's hard rule that a
metric either computes from real data or does not exist:

```bash
./scripts/anti-slop-check.sh
```

It fails the build on `Math.random`, placeholder/mock markers, or
`TODO: real implementation` in product code (tests, `fixtures/`, and lines
marked `ANTI-SLOP-EXEMPT` are exempt), and on credential-shaped strings
anywhere in the repo. Run it before you commit; CI runs it on every PR.

## Conventions

- **TypeScript strict** everywhere; **TDD** for logic (red → green).
- **Small, verified commits** — each one typechecks and passes tests.
- **No aspirational docs.** READMEs and docs claim only what is implemented
  and verified. A CI drift check enforces the contributor docs specifically:
  every package/app has a README, README `@toqar/*` dependency claims match
  `package.json`, and referenced scripts exist.
- **New tenant-facing surfaces register in `packages/isolation-suite`** in
  the same change — an unattacked surface is not shippable.

## Spec-driven changes (OpenSpec)

Non-trivial work is planned as an OpenSpec change under `openspec/changes/`
(proposal → specs → design → tasks) and validated with
`openspec validate <name> --strict` before implementation. See the archived
changes under `openspec/changes/archive/` for worked examples.
