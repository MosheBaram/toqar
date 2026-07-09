# Findings Experience

## Why

Everything so far is plumbing; this is the product face. Phase 1 change 1.5: the analysis agent that investigates and narrates, the feed where findings live (not a dashboard grid), Slack delivery, and the MCP server so customers' own agents query their analytics. Design D2 (synced) is the visual contract; the validation question log is the agent's eval set.

## What Changes

- New package `@toqar/analysis-agent`: playbook-driven investigations per TOQAR layer, calling `@toqar/analysis` primitives and semantic-layer queries as tools; produces findings whose every number carries a query id.
- New app `apps/web`: the findings feed built from the D2 design system (FindingCard, EvidenceDrilldown, filters, registry browser, AutonomyDial, onboarding).
- Slack delivery: findings and the weekly digest as Block Kit messages (SlackFinding design), automating the validation-era manual report.
- New package `@toqar/mcp-server`: tenant-scoped MCP server (TS SDK) exposing metrics, findings, and the registry to Claude Code/Cursor et al.

## Capabilities

### New Capabilities

- `analysis-agent` — investigation planning, playbooks, narrated findings with query citations.
- `findings-feed` — the web application.
- `slack-delivery` — findings + weekly digest to Slack.
- `mcp-server` — agent-native query surface.

### Modified Capabilities

None (consumes 1.1/1.3/1.4 contracts as-is).

## Impact

- Depends hard on 1.4 (numbers) and 1.3 (data); 1.2's seam maps enrich context. First frontend app in the repo; first scheduled background agent runs.
- Ship gate from the roadmap: the agent must correctly answer the agent-shaped questions logged verbatim in `docs/validation/question-log.md` before partners see findings.
