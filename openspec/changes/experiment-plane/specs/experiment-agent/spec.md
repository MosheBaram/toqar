# experiment-agent Specification

## ADDED Requirements

### Requirement: Hypothesis from a finding

An experiment SHALL originate from a finding (or an explicit operator hypothesis), carrying the metric it intends to move and the direction. The originating finding's query ids SHALL be recorded so the experiment's premise is itself cited.

#### Scenario: Finding becomes hypothesis

- **WHEN** a regression finding proposes "retry-with-backoff on crm_lookup should recover TSR"
- **THEN** an experiment record is created citing the finding and naming the target metric and expected direction

### Requirement: Variant shipped as a reviewed PR

The variant SHALL be implemented as a pull request through the instrumentation agent's PR machinery (branch, additive diff, host verification, PR body) and SHALL require the level-2 autonomy grant. No variant is auto-merged.

#### Scenario: Experiment PR needs level 2

- **WHEN** a tenant at autonomy level 1 triggers an experiment
- **THEN** the variant PR is not opened and the agent reports that experiment PRs require level 2

#### Scenario: Variant is a normal reviewed PR

- **WHEN** an experiment at level 2 proceeds
- **THEN** a PR is assembled for human review and merge — the review gate is identical to instrumentation PRs

### Requirement: Continuous guarded monitoring

Once live, the experiment SHALL be evaluated with sequential-stats on its target metric AND on the default guardrails (TSR, CPCT, Override Rate). A guardrail breaching its harm threshold SHALL raise a stop recommendation regardless of the target metric.

#### Scenario: Guardrail auto-stop

- **WHEN** a variant improves the target metric but Override Rate crosses its harm threshold with sequential significance
- **THEN** the agent recommends stopping the variant and records the guardrail breach

### Requirement: Verdict written to the registry

When the sequence concludes, the agent SHALL write a verdict (`ship` | `revert` | `inconclusive`) with the effect estimate, confidence sequence, per-arm samples, and guardrail outcomes to the registry backend — the experiment history that compounds.

#### Scenario: Verdict recorded and cited

- **WHEN** an experiment concludes `ship`
- **THEN** a verdict record exists in the registry with the effect estimate and its query ids, and it surfaces as an `experiment` finding in the feed

### Requirement: No fabricated results

The agent SHALL NOT declare a verdict before the sequence concludes, and SHALL NOT compute effect numbers with an LLM — all statistics come from `@toqar/experiments` over real per-arm data.

#### Scenario: Inconclusive stays inconclusive

- **WHEN** an experiment has insufficient data to cross a boundary
- **THEN** its status is `inconclusive` with the current interval, never a guessed winner
