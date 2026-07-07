## TOQAR analytics instrumentation

Implements the tracking plan in `analytics/tracking-plan.md`
({{n}} events: {{k}} TOQAR core + {{m}} product-specific).

### What this adds

- `src/analytics.ts` — one typed emit function per event; all delivery
  is fire-and-forget (analytics can never block or crash the agent loop).
- Call sites at {{count}} seams (listed in the tracking plan with
  `file:line` anchors).

### What this does not do

- No raw prompts, outputs, or user content leave your systems — only
  IDs, enums, counts, latencies, and costs.
- No behavior changes: every insertion is additive and side-effect-free
  for your control flow.

### Verification

- `{{their typecheck command}}` ✅
- `{{their test command}}` ✅

### Rollback

Delete `src/analytics.ts` and the call sites (grep `analytics.`), or
set `{{ANALYTICS_DISABLED_ENV_VAR}}=1`.
