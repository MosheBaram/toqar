# eval-framework Specification

## ADDED Requirements

### Requirement: Online and offline evaluation with versioned scorers

The platform SHALL score agent output quality two ways: online — scorers (LLM-as-judge and deterministic code checks) run asynchronously on live traces at a configurable per-tenant sampling rate — and offline — the same scorers run against curated, versioned datasets. Every score SHALL record the full version tuple at score time: prompt version, model version, agent version, dataset version, and evaluator version (rubric hash + judge model). A production trace SHALL be promotable into a dataset as a regression case in one action.

#### Scenario: A live trace is scored with its version tuple

- **WHEN** an online scorer evaluates a sampled production trace
- **THEN** the stored score carries the trace reference and the complete version tuple, so a later drift comparison can attribute change to prompt, model, agent, or evaluator

#### Scenario: A failing trace becomes a regression case

- **WHEN** an operator or agent promotes a production trace to a dataset
- **THEN** future offline eval runs include it and a regression on it is reported against the responsible version change

### Requirement: Trajectory-level evaluation

Evals SHALL be able to score the full trajectory (steps, tool calls, intermediate decisions), not only the final output, since output-only evaluation misses mid-run corruption.

#### Scenario: A mid-run failure is caught

- **WHEN** a run produces an acceptable final output via a broken intermediate tool-call sequence
- **THEN** a trajectory-level scorer can flag the run even though an output-only check passes

### Requirement: Judge scores are a distinct, honest signal class

LLM-as-judge scores SHALL be stored and displayed as a distinct signal class carrying their judge model and evaluator version — never presented as deterministic, citation-backed metrics. Judge-vs-human agreement SHALL be trackable, and the product SHALL surface calibration status rather than implying judge scores are ground truth.

#### Scenario: A judge score never masquerades as a metric

- **WHEN** a finding or view shows an LLM-judge score next to citation-backed numbers
- **THEN** the score is visibly labeled as a judged signal with its evaluator identity, and it is excluded from the `q_<hash>` citation contract's numeric claims

### Requirement: Human feedback and annotation feed evals

End-user feedback (the existing `feedback_given` event) and reviewer annotations SHALL attach to traces/spans and be usable as eval ground truth: for judge calibration and as dataset labels. The existing human-edit/override events SHALL be usable as quality signals with their known asymmetry (an edit is a strong negative; absence of an edit is only a weak positive).

#### Scenario: An annotation becomes ground truth

- **WHEN** a reviewer labels a sampled trace
- **THEN** the label is linked to the trace, counts toward judge-agreement tracking, and can join a dataset

### Requirement: CI eval gate

The platform SHALL expose an eval-suite run as a CI-consumable check (pass/fail with per-scorer results against tolerance thresholds), so a customer can gate merges on eval regressions.

#### Scenario: A regressing PR is blocked

- **WHEN** a customer's CI runs the eval suite against a change that regresses a scored dataset beyond tolerance
- **THEN** the check fails with the failing scorers and cases identified
