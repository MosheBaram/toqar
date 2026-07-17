<!-- claims: metrics=task_success_rate,cost_per_completed_task,override_rate -->
# Autonomy

Autonomy is a per-tenant dial. Every grant is explicit, audited, and
revocable; every level below your grant behaves exactly as before.

- **Level 0 — read-only analysis.** The agent queries your event stream
  and posts findings. It cannot touch your repo.
- **Level 1 — instrumentation PRs.** The agent may open pull requests that
  add or fix tracking calls. You review and merge.
- **Level 2 — experiment PRs.** The agent may open pull requests that run
  guarded experiments. You review and merge.
- **Level 3 — guardrailed rollout.** A winning variant promotes
  automatically — within limits you declare first.

Level 3 is constrained by your rollout policy: which change classes
autonomous action may touch (e.g. flag rollouts, prompt variants), a
canary traffic cap, protected task types it must never touch, and a
concurrency limit. The sequence is: canary at your cap → always-valid
sequential monitoring with the default guardrails (`task_success_rate`,
`cost_per_completed_task`, `override_rate`) → auto-promote only on a
statistically valid win with no guardrail breach → immediate automatic
rollback on any breach. Revoking the grant mid-rollout halts it safely.
An inconclusive canary is handed to a human — never guessed.

Everything outside your declared classes falls back to the human-gated PR
path, and every transition is audited with its citation-backed verdict.
