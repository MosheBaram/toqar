# Tasks — Findings Experience

> Depends on 1.3 + 1.4 shipped. TDD; the citation validator and eval harness land before the agent can publish anything.

## 1. Findings storage + citation validator

- [x] 1.1 Control-plane migration: `findings` + delivery records (D3 shapes); store TDD
- [x] 1.2 TDD citation validator: uncited numeric claim → rejection + regression log (Uncited-number scenario)
- [x] 1.3 Commit, PR, merge

## 2. Analysis agent (spec: analysis-agent)

- [ ] 2.1 Scaffold `packages/analysis-agent`; tool adapters over `@toqar/analysis` (queries + primitives as tool definitions)
- [ ] 2.2 Playbooks per TOQAR layer as versioned prompt+step templates; regression playbook first
- [ ] 2.3 Sweep worker: per-tenant schedule, skip-when-no-new-data, honest no-findings records
- [ ] 2.4 Eval harness from `docs/validation/question-log.md` agent-shaped questions (fixture data → expected query ids/values); wire into CI (D4)
- [ ] 2.5 Commit, PR, merge

## 3. Web app (spec: findings-feed)

- [ ] 3.1 Scaffold `apps/web` (Vite + React strict); tokens linked, fonts self-hosted (design-system caveat closed)
- [ ] 3.2 Productize D2 components (FindingCard, EvidenceDrilldown, filters, AppShell) with typed props; canonical-event-name rule enforced in one formatting helper
- [ ] 3.3 Feed + drill-down pages against the findings API; honest empty state with real sweep timing
- [ ] 3.4 Registry browser page (backend-sourced identity cards, deprecated struck-through)
- [ ] 3.5 Autonomy dial settings page: confirm-to-raise, backend grant + audit line (Grant-recorded scenario)
- [ ] 3.6 Commit, PR, merge

## 4. Slack delivery (spec: slack-delivery)

- [ ] 4.1 TDD Block Kit rendering from finding records (SlackFinding shape); webhook transport with delivery records
- [ ] 4.2 Weekly digest job rendering the validation-report structure with cited numbers
- [ ] 4.3 Commit, PR, merge

## 5. MCP server (spec: mcp-server) + close-out

- [ ] 5.1 Scaffold `packages/mcp-server` on the official TS SDK; tenant-token auth
- [ ] 5.2 TDD tools: `query_metric` (citation contract), `list_findings`/`get_finding`, `get_registry`; read-only surface test
- [ ] 5.3 E2E: Claude Code client session against a fixture tenant answers a logged question via MCP
- [ ] 5.4 READMEs, root README, `openspec validate --strict`; commit, PR, merge
