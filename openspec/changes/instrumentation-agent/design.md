# Design — Instrumentation Agent

## Context

Productizes `skills/instrument-agentic-app` (the behavioral reference — its hard rules are the agent's hard rules). First runtime Anthropic API dependency. Depends on the shipped registry backend for plan submission and seam-map persistence.

## Goals / Non-Goals

**Goals:** invocation-not-engagement instrumentation; compounding seam maps; measured merge rate.
**Non-Goals:** hosting the agent as a service (revisit after 1.3's hosting decision); supporting more than one backend framework; auto-merge of any kind (the human review gate is the product).

## Decisions

### D1: Runtime — Claude Agent SDK core in a package, CLI-invoked first *(recommendation, decide at review)*

Options considered: (a) **package + `toqar instrument` CLI, operator-run** — ships now, no hosting dependency, same core mounts behind a GitHub App later; (b) GitHub App/Action from day one — best UX but requires hosting, webhooks, and app review before any value; (c) keep using the skill in Claude Code sessions — no productization at all. **Recommended: (a)**, explicitly designed so the agent core takes a repo path + credentials and knows nothing about how it was invoked.

### D2: One backend framework — Express first *(recommendation; swap on partner evidence)*

The roadmap defers to partner evidence that doesn't exist yet (validation runs in parallel). Express has the largest install base in the target segment; the seam patterns (route handlers, middleware) transfer to Fastify/Koa later. The framework detector must refuse honestly rather than approximate (Scope-honesty requirement).

### D3: Seam map lives in the registry service, not files

New `repo_context` table + `/v1/registry/seam-map` routes (tenant-scoped like everything else). Alternative — files in the customer repo — rejected: the map is *our* accumulated understanding, and per-tenant backend storage is what makes it a moat and lets the analysis agent (1.5) read it too.

### D4: Deterministic tools, agent plans

The agent's LLM decides *where to look*; deterministic code does the grep/AST scanning, plan diffing (reusing `computeDiff`-style logic and `trackingPlanSchema`), and PR assembly. Prompt templates live in the package and are versioned — every run records its prompt + model version for regression tracing (Q-layer discipline applied to ourselves).

## Risks / Trade-offs

- [Agent quality unmeasurable pre-partners] → merge-rate recording is in the spec from day one; the fixture app is the regression bed.
- [Token cost per run] → cost surfaced per run (spec); budget alarm at the operator level, not hidden.
- [Express choice wrong] → detector + refusal make the blast radius one honest error message; swapping frameworks is additive.

## Open Questions

- GitHub App packaging timing — revisit when 1.3 lands hosting.
