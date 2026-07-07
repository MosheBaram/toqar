# Dry-run record — fixtures/agentic-app-demo

**Date:** 2026-07-07 · **Skill phases exercised:** 1 (map) and 2 (tracking plan). Stopped at the review gate as required; no instrumentation code written.

## Results

- Tracking plan (`fixtures/agentic-app-demo/analytics/tracking-plan.json`) parses with `trackingPlanSchema`: 9 added events.
- `feedback_given` correctly excluded — the fixture has no user-feedback seam, and the skill's hard rule forbids events without a real emission site.
- PII bait check: none of the planted content (lead email, name, personal notes, message body) appears in the plan; drafts and inputs referenced only via `*_ref`.
- Anchor check: every `code_locations` entry points at a real fixture file (`src/agent.ts`, `src/approval.ts`).
- Rendered `analytics/tracking-plan.md` via `renderTrackingPlan` from `@toqar/registry` (built from source).

Validation script: run from a scratch dir against the built registry —
parse plan JSON with `trackingPlanSchema`, grep for bait strings, stat
each anchored file, write the rendered markdown.

## Caveats

- This dry-run was performed by the same agent that authored both the
  skill and the fixture — it validates the pipeline mechanics (schema,
  rendering, privacy discipline, review gate), not the skill's seam-
  discovery ability on unfamiliar code. The first real test of that is
  design partner #1's repo; treat that engagement as the true eval.
- Phase 3–4 (implementation + PR) were not exercised: the fixture needs
  no real instrumentation PR, and the review gate stops before them by
  design.

## Skill fixes from this run

None required — first pass produced a clean plan (see caveat above for
why that's weak evidence).
