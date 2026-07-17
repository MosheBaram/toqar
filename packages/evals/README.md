# @toqar/evals

The eval framework's deterministic core (spec: eval-framework): trajectory-
level code scorers, the LLM-judge seam, versioned dataset suites, and the
CI gate. Storage and HTTP routes live in `@toqar/registry-service`
(`EvalsStore`, `/v1/evals/*`).

Two signal classes, never conflated:

- **Code scorers** — deterministic, trajectory-level (they read the ordered
  steps, not just the final outcome; output-only evaluation passes runs a
  trajectory check catches). Built-ins: `task_completed`,
  `clean_trajectory`, `low_retry_churn`, `no_human_intervention`.
- **Judge scorers** — LLM-as-judge through the `JudgeExecutor` seam
  (fixture in tests, a real model call in production). Directional, always
  carrying judge model + rubric hash and their own latency/token cost, and
  **excluded from the `q_<hash>` citation contract by construction**.

Every score carries the full version tuple (prompt/model/agent/dataset +
evaluator) captured at score time — without it, drift is uninterpretable,
so it is rejected at the schema boundary, never defaulted.

## Dependencies

| Package | Why |
| --- | --- |
| `zod` | Score/version-tuple schemas — the version tuple is validated, not assumed. |

No `@toqar/*` dependencies — a leaf, like `analysis` and `experiments`.

## Suites & the CI gate

```ts
import { BUILTIN_SCORERS, evaluateGate, runSuite } from '@toqar/evals';

const result = runSuite(dataset, BUILTIN_SCORERS, versions);
const gate = evaluateGate(result, [{ scorer_id: 'clean_trajectory', min_mean: 0.9 }]);
// gate.pass === false names the failing scorers and cases — CI-consumable.
```

`judgeAgreement` pairs judge and human scores per trace for calibration
(below ~0.8 agreement, recalibrate the judge — surfaced, never hidden;
no data returns `null`, never a fabricated rate).

## Tests

```bash
pnpm --filter @toqar/evals test
```
