# Design — Phase 0 Validation Toolkit

## Context

Fresh repo (`toqar`) after the assessed-and-abandoned `aialytics` attempt. The complete implementation source — exact file contents, commands, and commit points — already exists at `new-repo-handoff/plans/2026-07-07-phase-0-validation-toolkit.md` (1,485 lines). The strategic brief is `new-repo-handoff/KICKOFF-PROMPT.md`. Reusable analysis-layer seeds live in `new-repo-handoff/quarry/` (Phase 1 material; nothing ships from it in Phase 0). Anti-slop constraints from the autopsy are hard: no fake data outside tests, no aspirational docs, every commit typechecks and tests green, TDD for logic code.

## Goals / Non-Goals

**Goals**

- Everything the 8-week concierge validation needs: registry package, instrumentation skill, public schema spec, validation ops kit.
- A repeatable quality gate for the skill (fixture dry-run) before it touches a partner repo.

**Non-Goals**

- Ingestion, dashboards, services, MCP server, analysis agents — all kill-criteria-gated to Phase 1.
- Any package beyond `packages/registry`.
- Design-partner recruiting (happens outside the repo).

## Decisions

### D1: Product name is Toqar; rename applied at the source

The product is named **Toqar** (the TOQAR framework doubles as the brand). Root package: `toqar`. Package scope: `@toqar/registry`. Applied by editing the source plan in place (it is the executable HOW; leaving stale names there guarantees wrong scaffolding). The rename is internal-only: the analytics wrapper vendored into partner repos is self-contained and uses only the TOQAR vocabulary, so no partner-facing artifact changes. Alternative considered: recording the rename as an override note — rejected because executors copy code blocks verbatim.

### D2: The plan file stays the code source; OpenSpec holds the contract

The plan embeds complete file contents. Duplicating them into `tasks.md` would create a second source of truth that drifts. Split: **specs = WHAT** (requirements + scenarios, lifted from the plan's own tests), **plan = HOW** (exact code), **tasks.md = tracking** (checkboxes referencing plan sections). `openspec verify` validates execution against the specs, not the plan prose.

### D3: pnpm workspaces, not NX (carried from the plan)

One package needs no build orchestrator; every scaffold file is explicit. NX can be layered on in Phase 1 when a real build graph exists.

### D4: Fixture app added beyond the source plan

The plan's only dry-run instruction was "any small agentic repo" — a hand-wave directly under the phase's single hard quality bar (PR mergeable with ≤ minor edits, and kill-criterion A1 depends on it). A small deliberately-imperfect fixture (agent loop, model call, tool call, human-approval seam, planted sensitive content as PII bait) makes skill quality repeatable and testable. This is the one scope addition; strike task group 8 to revert it.

### D5: Handoff docs are otherwise immutable

`new-repo-handoff/` is the historical record. Only the naming edits from D1 touch it; quarry files are never edited in place (they get copied and decoupled in Phase 1).

## Risks / Trade-offs

- [Plan and specs drift as execution hits reality] → Specs are the contract; when a deviation is needed, update the delta spec in this change first, then the code. The plan is not updated retroactively except for naming.
- [Skill quality is judgment, not unit-testable] → The fixture dry-run gate (D4) plus the skill's own review checklist are the verification; the real test is partner PR #1.
- [Embedded plan code may not compile against current dependency versions (Zod 3.23, vitest 2, TS 5.5 pins from mid-2026)] → Every task ends with `pnpm typecheck && pnpm test`; fix forward in code, note deviations in tasks.md.

## Open Questions

- Fixture app shape: standalone repo under `fixtures/` in this monorepo vs. a separate scratch repo. Leaning `fixtures/agentic-app-demo/` in-repo (versioned, CI-able) — decide at task group 8.
