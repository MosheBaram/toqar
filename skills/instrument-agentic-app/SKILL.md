---
name: instrument-agentic-app
description: Instrument an agentic product's codebase with TOQAR analytics events. Use when onboarding a design partner or asked to add task/step/handoff tracking to an agent codebase. Produces a tracking plan for review, then an instrumentation PR.
---

# Instrument an Agentic App

You are the concierge instrumentation agent. Given a design partner's
repo, you produce (1) a tracking plan as a registry diff, pause for
human review, then (2) a small, mergeable instrumentation PR.

**Quality bar: the PR must be mergeable with at most minor edits.**
A rejected PR is a failed engagement (validation kill-criterion A1).

## Hard rules

- Never invent data or emit placeholder events. Every emission site must
  correspond to real behavior in their code.
- Never block the agent loop: analytics calls are fire-and-forget,
  errors swallowed and logged, never thrown.
- Never put raw user content, prompts, or outputs into event properties.
  Use `*_ref` string pointers into the customer's own storage.
- Never restructure their code. Instrumentation is additive: one wrapper
  module + thin calls at existing seams.
- Stop for explicit human approval between the tracking plan and the
  implementation. Never skip the review gate.

## Inputs — collect before starting

1. Destination: their PostHog project key, or the hosted ClickHouse HTTP
   endpoint + token we provisioned. (Wizard-of-oz: we build no ingestion.)
2. Their "3 unanswerable questions", verbatim, from the intake doc.
3. Repo access and permission to open a PR.

## Phase 1 — Map the agent loop (read-only)

1. Read README, docs, `package.json`. Identify the agent framework: raw
   Anthropic/OpenAI SDK calls, Vercel AI SDK, LangChain, Mastra, custom.
2. Find the seams by searching for:
   - Task starts: queue consumers, cron handlers, API routes, webhook
     handlers that kick off agent work.
   - Steps: LLM SDK call sites (`anthropic.messages.create`,
     `generateText`, `chat.completions`), tool dispatch functions,
     retrieval calls.
   - Outcomes: where the loop decides success/failure/give-up.
   - Handoffs: approval UIs, Slack/email review steps, human queues.
   - Verification: tests, webhook acks, downstream confirmations that
     could upgrade `self_reported` to `verified`.
3. Write the task taxonomy: 1–5 `task_type` names, snake_case, named
   after the unit of value ("reply_to_lead", not "run_agent").

## Phase 2 — Tracking plan (the review gate)

1. Draft 10–20 events: the 10 TOQAR core events (see
   `packages/registry/README.md` in the toqar repo for
   semantics) plus up to 10 product-specific events, each tied to one of
   their 3 unanswerable questions.
2. Every event gets: `journey`, `owner_metric`, `hypothesis` (which
   question it answers), `code_locations` (`file:line`), and
   `implementation_notes`. An event with no owner metric does not ship.
3. Render using `templates/tracking-plan.md`; save as
   `analytics/tracking-plan.md` on a new branch in their repo.
4. **STOP. Present the plan and wait for approval.** Adjust as asked.

## Phase 3 — Implement

1. Create `src/analytics.ts` (or their conventional location) from
   `templates/analytics-wrapper.ts`: one typed function per event, all
   routing through a single `track()` with fire-and-forget delivery.
2. Insert calls at the seams from the plan. Envelope fields: generate
   `event_id` per event; propagate `task_id`/`run_id` through existing
   context (add a small context object only if unavoidable).
3. Populate `agent.version` from their release identifier (git sha, env
   var, or package version — whatever they already have).
4. Run their typecheck, lint, and test commands. All must pass.

## Phase 4 — PR

1. Branch: `analytics/toqar-instrumentation`. Keep the diff to: wrapper
   module, call-site insertions, `analytics/tracking-plan.md`, and (if
   needed) one config/env entry.
2. PR body from `templates/pr-body.md` — includes event inventory,
   privacy notes, and the one-line rollback (delete the wrapper).
3. Deliver the PR link. Log the date for the validation scorecard.
