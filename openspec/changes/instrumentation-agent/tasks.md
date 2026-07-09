# Tasks — Instrumentation Agent

> TDD; each group ships through branch → PR → CI → merge. Fixture app (`fixtures/agentic-app-demo`) is the regression bed throughout.

## 1. Seam-map storage (spec: registry-backend delta)

- [x] 1.1 Migration 002: `repo_context` (tenant-scoped, repo key, seam-map jsonb, produced_at, agent_version)
- [x] 1.2 TDD store + routes: put/get latest seam map, audit append, tenant isolation scenario
- [x] 1.3 Commit, PR, merge

## 2. Agent core package

- [x] 2.1 Scaffold `packages/instrumentation-agent` (Claude Agent SDK, workspace deps registry + cli-shared code where sensible)
- [x] 2.2 TDD deterministic seam scanner: detect framework (Express/React/raw SDK), locate task starts, LLM/tool call sites, outcome + handoff seams against the fixture app; unsupported-stack refusal scenario
- [x] 2.3 TDD plan builder: seam map → `TrackingPlan` (proposed entries, real `file:line` anchors, three-questions mapping when intake provided); submit to registry backend as `proposed`
- [x] 2.4 Agent loop: prompts (versioned) driving the scanner/plan tools; run record with tokens + cost; seam map persisted via group 1 routes
- [x] 2.5 Commit, PR, merge

## 3. Implementation + PR phases

- [ ] 3.1 TDD wrapper generation from the skill's template (typed per-event functions matched to the approved plan) + call-site insertion at approved seams
- [ ] 3.2 Host verification runner: execute the repo's typecheck/test commands; abort PR on red
- [ ] 3.3 PR assembly (branch, body from skill template, rollback notes); delivery + outcome recording (merge-rate metric)
- [ ] 3.4 Commit, PR, merge

## 4. CLI + end-to-end

- [ ] 4.1 `toqar instrument <path>` wiring the core (env creds, approval prompt at the review gate)
- [ ] 4.2 E2E against the fixture app: map → plan proposed in backend → approve → PR-shaped diff produced → host checks green; second run reuses seam map scenario
- [ ] 4.3 README (honest scope: TS + React + Express), root README entry; `openspec validate --strict`; commit, PR, merge
