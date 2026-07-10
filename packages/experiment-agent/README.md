# @toqar/experiment-agent

The third product loop: Toqar *iterates* for you. A finding becomes a
hypothesis, a variant ships as a reviewed PR, sequential-stats monitor it
continuously against guardrails, and the verdict compounds in the
registry.

## The loop

1. **`startExperiment`** — reads the tenant's autonomy level. Experiment
   PRs require **level 2**; below that it refuses without opening a PR or
   creating a record. At level 2 it creates a cited experiment (carrying
   the originating finding's query ids) and assembles a variant PR via an
   `assembleVariantPr` seam (production wires the instrumentation agent's
   PR machinery — same human review gate, no auto-merge).
2. **`monitorExperiment`** — `@toqar/experiments` sequential tests on the
   target metric and each default guardrail (TSR, CPCT, Override Rate).
   - A guardrail breaching its harm threshold **stops the variant
     regardless of the target**.
   - The target concludes `ship`/`revert` only when the sequence crosses;
     otherwise it stays **inconclusive** — no verdict, no guessed winner.
   - No statistics are computed by an LLM.
3. **Verdict → registry → finding** — the verdict (decision, effect,
   confidence sequence, per-arm samples, guardrail outcomes, query ids)
   is written to the registry and surfaced as an `experiment`-variant
   finding; the feed, Slack, and MCP inherit it. Every number cites its
   query.

## Read-only over MCP

`list_experiments` and `get_verdict` expose experiments and verdicts to
customers' own agents through the MCP server — read-only, tenant-scoped,
with the same citation contract.
