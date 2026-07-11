# Design — Documentation Completeness

## Context

The code exists; the map to it does not. A contributor cloning the repo finds 14 packages + 2 apps, six of them with no README, no single picture of how they compose, and no setup guide for the Docker-backed integration tests or the anti-slop gate. This change writes that missing layer. The constraint that makes it non-trivial: docs rot. The anti-slop rule already bans aspirational *public* docs; this extends the same enforcement to contributor docs so they stay true after the PR merges.

## Goals / Non-Goals

**Goals:** every package/app documented; one architecture overview grounded in the real dependency graph; a clone-to-green contributor guide; a CI check that keeps all of it from drifting.

**Non-Goals:** rewriting the public docs site (`public-docs` owns that); product code changes (none); tutorials or per-metric deep-dives (the schema spec and layer posts already cover the product vocabulary).

## Decisions

### D1: A new `contributor-docs` capability, separate from `public-docs`

`public-docs` is the customer-facing published site anchored on the schema spec. This is the internal map for people editing the repo — different audience, different drift check. Keeping them separate means the internal docs check can assert workspace facts (every package has a README, deps match `package.json`) without entangling the public build.

### D2: The dependency graph is generated/derived, not hand-drawn

`ARCHITECTURE.md`'s graph comes from the actual `@toqar/*` dependencies. The captured layering: leaves (`registry`, `analysis`, `experiments`, `sdk`) → data/control services (`registry-service`, `collector`, `billing`) → composition (`pipeline`, `mcp-server`) → agents (`analysis-agent`, `experiment-agent`, `instrumentation-agent`) and the `isolation-suite` → apps (`web`, `docs`, `cli`). Because the drift check re-derives this from `package.json`, a hand-edit that lies gets caught.

### D3: The drift check is the enforcement, mirroring the public-docs cross-reference gate

`public-docs` already fails the build on a claim with no backing code. This adds the contributor-side analog: a script that enumerates `packages/*` and `apps/*`, asserts each has a README, and checks that dependency and script references resolve against the workspace. Same philosophy — docs are verified, not trusted — applied one directory up.

### D4: READMEs follow one shape

Each README: one-paragraph purpose, its `@toqar/*` dependencies (and why), how it's run/consumed, how it's tested (unit vs. the compose integration job where relevant). Uniform shape keeps them auto-checkable and quick to read. No badges, no feature lists for unbuilt work.

## Risks / Trade-offs

- [Docs drift after merge] → the CI drift check is the mitigation; without it this change decays. It ships *with* the docs, not later.
- [The drift check is too strict and blocks unrelated PRs] → scope it to objective, mechanical facts (README exists, deps match, referenced scripts exist), not prose quality; prose stays a review concern.
- [Overlap/confusion with `public-docs`] → explicit capability split (D1); `CONTRIBUTING.md` points to `apps/docs` for the customer-facing side.

## Open Questions

- Whether the drift check is a standalone script or folded into the existing docs cross-reference job — decide at implementation; a small standalone script in `scripts/` composes cleanly with the anti-slop gate and is the likely choice.
