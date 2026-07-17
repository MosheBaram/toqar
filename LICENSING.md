# Licensing

Toqar's licensing split (founder decision #3, 2026-07-17 —
`docs/business/go-to-market.md` §9): **open the standard and the adoption
surface; keep the engine commercial.**

## Open source — MIT

| Package | Why it's open |
| --- | --- |
| `packages/registry` | **The TOQAR standard**: the event schema and metric definitions for measuring agentic products. A spec nobody owns can become the standard everybody cites — if competitors adopt the schema, Toqar wins the framing war. |
| `packages/sdk` | The adoption surface: typed emitters + framework wrappers. The npm package coding agents and developers reach for (the `react-email` lesson). |
| `packages/mcp-server` | The agent-native query surface; MCP registries require public inspection to list it. |

Each carries its own MIT `LICENSE` file and `"license": "MIT"`.

## Proprietary — all other packages and apps

The analytics engine and everything defensible: the semantic layer and
citation pipeline (`analysis`), the eval runtime (`evals`), the agents
(`analysis-agent`, `instrumentation-agent`, `experiment-agent` incl. the
guardrailed autonomous rollout), the collector/pipeline, the registry
service, billing, and above all **cross-tenant benchmarking** —
structurally impossible to self-host, the cleanest moat. These are
`"license": "UNLICENSED", "private": true` (never published).

**Deliberately not full open-core**: a solo founder cannot service
self-hosters, and the open bar in this market only rises (Langfuse
open-sourced formerly-commercial features in 2025). Spec + SDK + MCP
captures most of the distribution at a fraction of the maintenance.

## Operator-gated next steps

Publishing the three MIT packages to npm and/or extracting them to public
repositories requires accounts and a publish pipeline — an operator act.
Until then, the licensing is in force in-repo: the three packages are
MIT-licensed as they stand.
