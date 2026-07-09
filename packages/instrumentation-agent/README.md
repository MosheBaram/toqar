# @toqar/instrumentation-agent

The productized concierge: given a customer repo, map its agent loop,
propose a tracking plan, and — only after explicit human approval —
implement the instrumentation and assemble the PR branch. The skill
(`skills/instrument-agentic-app`) remains the behavioral reference and
manual fallback.

## Supported scope (honest)

TypeScript/Node repos using Express routes, React, or direct LLM SDKs
(`@anthropic-ai/sdk`, `openai`, Vercel `ai`). Anything else is refused
with the reason — the agent does not guess unfamiliar stacks.

## Flow

1. **Scan** (deterministic): framework detection, seam heuristics
   (task starts, LLM/tool calls, handoffs, outcomes), task taxonomy.
2. **Plan**: seams → TOQAR core events as `modified` registry entries
   with real `file:line` anchors. No seam, no event. Optional model pass
   reviews the plan (advisory prose; numbers/anchors stay deterministic).
   The seam map persists to the registry backend; repeat runs load it
   and report seam changes.
3. **Review gate**: stops here without approval. Always.
4. **Implement** (approved plans only): wrapper module with emitters for
   planned events, deterministic `task_started` wiring, validated
   model-proposed insertions, then the host repo's own typecheck/test —
   any red aborts.
5. **Assemble**: `analytics/toqar-instrumentation` branch + commit +
   truthful PR body. Pushing/opening the PR is the operator's act.
   Every delivery is recorded server-side; merge rate is computed from
   those records.

## Usage

Via the CLI: `toqar instrument <path>` (plan only, exit 2) then
`toqar instrument <path> --approve`. Env: `TOQAR_API_URL`, `TOQAR_TOKEN`;
model pass needs `ANTHROPIC_API_KEY` wired by the caller via
`createAnthropicSession`. Every run reports tokens and cost.
