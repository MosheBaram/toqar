<!-- claims: events=step_executed,human_overrode,feedback_given -->
# Evals

Toqar scores agent quality two ways, and never conflates them:

- **Code scorers** are deterministic and **trajectory-level** — they read
  the ordered steps of a run (`step_executed` statuses, retries, human
  events), not just the final outcome. A run that produces a fine answer
  through a broken tool path passes an output-only check and fails
  `clean_trajectory`. Built-ins: `task_completed`, `clean_trajectory`,
  `low_retry_churn`, `no_human_intervention`.
- **Judge scorers** are LLM-as-judge: directional signals that always carry
  their judge model and rubric hash. Judge runs are themselves observable
  (latency, tokens). Judge scores are excluded from the citation contract
  by construction — they never appear as measured numbers.

Every score records the full version tuple at score time — prompt, model,
agent, dataset, and evaluator versions — so drift is attributable. A score
without its versions is rejected, not defaulted.

**Datasets and the CI gate**: promote any production trace into a versioned
dataset in one call; run the suite against thresholds and get a
CI-consumable pass/fail that names the failing scorers and cases. Human
feedback (`feedback_given`, reviewer labels) joins as ground truth;
judge-vs-human agreement is tracked and surfaced — below ~0.8, recalibrate
the judge. Override events (`human_overrode`) are a strong negative signal;
their absence is only a weak positive — the asymmetry is stated, not hidden.

API: `POST/GET /v1/evals/scores`, `POST /v1/evals/datasets`,
`GET /v1/evals/agreement/:evaluator`.
