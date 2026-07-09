# Design — Findings Experience

## Context

The product face over 1.1–1.4's plumbing. Visual contract: D2 components in `skills/toqar-design/` (synced, validated). Behavioral contract for the agent: findings cite everything; the empty state is honest; the eval set is the validation question log.

## Goals / Non-Goals

**Goals:** narrated findings with total query provenance; feed + registry browser + autonomy dial UI; Slack automation of the weekly report; read-only MCP.
**Non-Goals:** experiment authoring (2.1); user management/SSO (1.6 groundwork, GA polish in 2.2); mobile; MCP write tools.

## Decisions

### D1: Web stack — Vite + React, tokens linked verbatim

`apps/web` (first `apps/*` workspace) with Vite + React + TypeScript strict. The D2 JSX components are the *reference implementations*: they get productized into `apps/web/src/components` with typed props from the shipped `.d.ts` files, importing `skills/toqar-design/styles.css` tokens verbatim (fonts self-hosted per the design system's caveat). No CSS framework — the token system is the framework.

### D2: Agent runtime — scheduled sweeps, Anthropic API with tool use

The analysis agent runs as a worker (same VM as 1.3 infra initially): per-tenant cron sweeps → playbook selection → tool-use loop where tools are semantic-layer queries and primitives. Prompts versioned like 1.2's (every finding records prompt + model version). Finding publication passes the citation validator (spec) before it exists anywhere.

### D3: Findings are rows, evidence is structured

`findings` storage (control-plane Postgres): headline, summary, layer, severity, variant, evidence chain as structured steps `{title, note, query_id, result_ref}` — exactly the D2 `EvidenceDrilldown` shape, so UI and Slack render from the same record without re-derivation.

### D4: Eval harness before partner exposure

The question-log eval (spec requirement) is a vitest suite: fixture ClickHouse data + logged question → expected query ids + values. It starts with the questions logged during validation; every new inbound question becomes an eval case. The agent ships to a partner only when its logged agent-shaped questions pass.

### D5: Slack via incoming webhooks first

Per-tenant webhook URL (config in control plane) before a full Slack app — no OAuth dance for design partners; the Block Kit payload shape is identical either way, so upgrading to a Slack app later changes transport only.

## Risks / Trade-offs

- [LLM narrative could smuggle numbers] → citation validator rejects uncited numerics pre-publication; rejects are logged for prompt regression (spec scenario).
- [Sweep cost across tenants] → per-tenant schedules + budget caps; sweeps skip when no new data since last run.
- [D2 reference components were preview-grade] → productization pass includes a11y and state handling; visual parity checked against the design-system cards.

## Open Questions

- Sweep cadence default (6h in the D2 empty-state copy — validate against real data volume when 1.3 is live).
