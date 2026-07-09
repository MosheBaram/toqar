# Instrumentation Agent

## Why

The concierge skill proved the flow (tracking plan → review gate → PR) but requires a human driving a Claude Code session. Phase 1 change 1.2: productize it so instrumenting a customer repo is an invocation, not an engagement — and so every run's understanding of the customer's codebase (the seam map) compounds in the registry backend instead of evaporating with the session.

## What Changes

- New package `packages/instrumentation-agent`: the agent core — seam mapping, tracking-plan generation, and PR authoring — built on the Claude Agent SDK, sharing its vocabulary with `@toqar/registry` and its diff format with the registry backend.
- New CLI command `toqar instrument <repo-path>`: invokes the agent locally (operator-driven at first; the same core mounts behind a GitHub App when hosting exists after change 1.3).
- Registry backend gains seam-map storage: each run persists what it learned about the repo (framework, seams, taxonomy) per tenant — the accumulated-context moat starts here.
- Scope discipline: TypeScript repos, React frontends, and **one** Node backend framework at launch; a second framework is a new change.
- The `instrument-agentic-app` skill remains the manual fallback and the behavioral reference.

## Capabilities

### New Capabilities

- `instrumentation-agent` — the productized agent: phases, review gate, PR quality bar, privacy rules, seam-map persistence, merge-rate measurement.

### Modified Capabilities

- `registry-backend` — adds seam-map storage and retrieval (new requirement; existing requirements unchanged).

## Impact

- New package + one CLI command; consumes `@toqar/registry`, `@toqar/registry-service` API, Anthropic API (first runtime LLM dependency in the repo).
- Depends on change 1.1 (shipped). Blocks nothing; 1.3–1.5 proceed independently.
- Cost: agent runs bill Anthropic tokens per invocation — surfaced per run, never hidden.
