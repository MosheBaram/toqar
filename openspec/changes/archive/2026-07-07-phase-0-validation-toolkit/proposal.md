# Phase 0 Validation Toolkit

## Why

Toqar — an agentic product-analytics platform ("Mixpanel for the agentic world") — must pass an 8-week concierge validation with 5 design partners before any platform code is justified. This change builds everything that test needs and nothing more: the TOQAR event registry, the concierge instrumentation skill (v0 of the product), the public schema spec, and the validation ops kit. The predecessor repo (`aialytics`) died of breadth and fake data; this change is deliberately thin and gated by the anti-slop constraints in `new-repo-handoff/KICKOFF-PROMPT.md`.

## What Changes

- Scaffold a TypeScript monorepo (pnpm workspaces, vitest, strict TS; root package `toqar`).
- New package `@toqar/registry`: TOQAR event envelope, the 10 core event schemas (Zod, discriminated union), registry-entry and tracking-plan-diff types, and a tracking-plan markdown renderer.
- Public schema spec at `packages/registry/README.md` (doubles as the category-creation content artifact).
- New Claude Code skill `skills/instrument-agentic-app`: maps a partner repo's agent loop, proposes a tracking plan (review gate), then implements an instrumentation PR. Quality bar: mergeable with at most minor edits.
- Validation ops kit under `docs/validation/`: intake template, weekly report template, verbatim question log, kill-criteria scorecard.
- **Addition beyond the source plan:** a fixture agentic app for dry-running the skill repeatably before it touches a real partner repo (the plan hand-waved this as "any small agentic repo").
- **Addition beyond the source plan:** CI quality gates — a GitHub Actions workflow (typecheck + tests on every push/PR) plus an anti-slop static check that fails the build on fake-data patterns outside tests. The plan stated these constraints but nothing enforced them.
- **Naming decision applied:** the product is named **Toqar**. The source plan's `agentic-analytics` names are updated in place (`toqar` root package, `@toqar/registry` scope). Partner-facing artifacts are unaffected — the vendored analytics wrapper is self-contained and only uses the TOQAR vocabulary.

## Capabilities

### New Capabilities

- `event-registry` — the TOQAR event envelope, the ten core event schemas, naming and privacy rules, and the public schema spec that documents them.
- `tracking-plan` — registry entries (an event's identity card: journey, owner metric, hypothesis), planned events with code anchors, the tracking-plan-as-diff format, and its markdown renderer.
- `instrumentation-skill` — the concierge Claude Code skill: two-phase flow with a human review gate, PR quality bar, privacy rules for generated code, and the fixture dry-run gate.
- `validation-ops` — the operating documents for the 8-week concierge test.
- `quality-gates` — CI workflow (typecheck + tests on push/PR) and the anti-slop static check enforcing the no-fake-data rule.

### Modified Capabilities

None (greenfield repo).

## Impact

- Everything is new code; no existing systems affected.
- Implementation source: `new-repo-handoff/plans/2026-07-07-phase-0-validation-toolkit.md` contains the exact file contents and commands for every task. `tasks.md` in this change references it rather than duplicating it.
- Explicitly out of scope (kill-criteria-gated): ingestion, dashboards, services, any package beyond `packages/registry`, design-partner recruiting.
