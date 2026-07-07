# Tasks — Phase 0 Validation Toolkit

> Implementation source: `new-repo-handoff/plans/2026-07-07-phase-0-validation-toolkit.md` (referenced below as **the plan**). It contains the exact file contents, commands, and expected outputs for every step — follow it verbatim (Toqar naming already applied). Every group ends with a commit that typechecks and passes tests.

## 1. Monorepo scaffold (plan Task 1)

- [x] 1.1 Write root files: `package.json` (name `toqar`), `pnpm-workspace.yaml`, `tsconfig.base.json`, `README.md` — contents in plan Task 1. Keep the existing `.gitignore` (already committed with the plan's entries plus local-tool-state exclusions); do not overwrite it
- [x] 1.2 `pnpm install`; verify lockfile created, no errors
- [x] 1.3 Commit `chore: scaffold pnpm workspace monorepo`

## 2. CI quality gates (addition — design D6, spec quality-gates)

- [x] 2.1 Write `.github/workflows/ci.yml`: on push to main and pull_request — Node 20, pnpm, `pnpm install`, `pnpm typecheck`, `pnpm test`
- [x] 2.2 Write the anti-slop check (`scripts/anti-slop-check.sh` or equivalent): fail on `Math.random(` or mock/placeholder markers outside `*.test.ts`, `fixtures/`, and marked seed scripts; wire it as a CI step
- [x] 2.3 Commit, push, and verify the workflow runs green on GitHub
- [x] 2.4 (manual, optional) Enable branch protection on `main` requiring the CI check

## 3. Registry package — event envelope (plan Task 2)

- [x] 3.1 Scaffold `packages/registry` (`package.json` as `@toqar/registry`, `tsconfig.json`, `vitest.config.ts`) — contents in plan Task 2
- [x] 3.2 Write failing test `src/envelope.test.ts`, verify it fails
- [x] 3.3 Implement `src/envelope.ts` (`eventEnvelopeSchema`, `agentIdentitySchema`, `SCHEMA_VERSION`); tests green
- [x] 3.4 `pnpm typecheck && pnpm test`; commit

## 4. The ten TOQAR core events (plan Task 3)

- [x] 4.1 Write failing test `src/events.test.ts` (ten event names, valid/invalid payloads, discriminator routing), verify it fails
- [x] 4.2 Implement `src/events.ts` (ten schemas, `toqarEventSchema` union, `TOQAR_EVENT_NAMES`) and `src/index.ts`; tests green
- [x] 4.3 `pnpm typecheck && pnpm test`; commit

## 5. Registry entries and tracking-plan diff (plan Task 4)

- [x] 5.1 Write failing test `src/tracking-plan.test.ts` (schema validation, markdown rendering, empty-section omission), verify it fails
- [x] 5.2 Implement `src/tracking-plan.ts` (`registryEntrySchema`, `plannedEventSchema`, `trackingPlanSchema`, `renderTrackingPlan`); export from index; tests green
- [x] 5.3 `pnpm typecheck && pnpm test`; commit

## 6. Public schema spec (plan Task 5)

- [x] 6.1 Write `packages/registry/README.md`: primitives, the ten events, the five TOQAR layers with metric derivations, status section — contents in plan Task 5
- [x] 6.2 Cross-check every documented event against `TOQAR_EVENT_NAMES`; no aspirational claims; commit

## 7. Concierge instrumentation skill (plan Task 6)

- [x] 7.1 Write `skills/instrument-agentic-app/SKILL.md` (hard rules, inputs, the four phases with review gate) — contents in plan Task 6
- [x] 7.2 Write `templates/tracking-plan.md` (three-questions mapping, added events, privacy, partner review checklist)
- [x] 7.3 Write `templates/pr-body.md`
- [x] 7.4 Write `templates/analytics-wrapper.ts` (self-contained, fire-and-forget, env-var kill switch, one typed function per event)
- [x] 7.5 Commit `feat(skill): concierge instrumentation skill with templates`

## 8. Validation ops kit (plan Task 7)

- [x] 8.1 Write `docs/validation/README.md` (cadence, weekly ritual, decision rules)
- [x] 8.2 Write `intake-template.md` (three unanswerable questions verbatim, task taxonomy draft, destination, access)
- [x] 8.3 Write `weekly-report-template.md` (TOQAR snapshot, finding of the week, question-you-can-now-answer, watching next week)
- [x] 8.4 Write `question-log.md` (verbatim log with agent-shaped/classic classification)
- [x] 8.5 Write `scorecard.md` (A1/A2/A3/WTP gates, decision rules, weekly history)
- [x] 8.6 Commit

## 9. Fixture app and skill dry-run (addition — design D4)

- [x] 9.1 Create `fixtures/agentic-app-demo/`: a minimal TS agentic app with one `anthropic.messages.create` call, one tool call, one human-approval seam, and planted sensitive content (PII bait) — clearly marked as a fixture, excluded from workspace packages
- [x] 9.2 Dry-run `/instrument-agentic-app` against the fixture; confirm it stops at the review gate with no code written
- [x] 9.3 Validate the produced tracking plan against `trackingPlanSchema`; confirm seam anchors are real `file:line`s and PII bait appears only behind `*_ref` pointers
- [x] 9.4 Record dry-run results and any skill fixes in `skills/instrument-agentic-app/` (iterate until the plan is clean); commit
