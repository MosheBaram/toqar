# validation-ops Specification

## ADDED Requirements

### Requirement: Intake template

`docs/validation/intake-template.md` SHALL capture, per design partner at week 0: their three unanswerable questions **verbatim** (no paraphrasing), a task taxonomy draft in their own vocabulary, the data destination (their PostHog free tier or hosted ClickHouse), and repo/Slack access details.

#### Scenario: Verbatim capture

- **WHEN** a partner states an unanswerable question during intake
- **THEN** the template stores it word-for-word, marked as verbatim

### Requirement: Weekly report template

`docs/validation/weekly-report-template.md` SHALL structure the weekly Slack report as: a TOQAR metrics snapshot, one finding of the week, one question the partner can now answer that they couldn't before, and what is being watched next week. It doubles as the v0 analysis toolbox for the future analysis agent.

#### Scenario: Report references real numbers only

- **WHEN** a weekly report is produced from the template
- **THEN** every number in it derives from the partner's actual event data (no placeholders or estimates presented as measurements)

### Requirement: Verbatim question log

`docs/validation/question-log.md` SHALL log every inbound partner question verbatim with date, partner, and a classification (agent-shaped vs. classic analytics). The log is the eval set for the future analysis agent.

#### Scenario: Inbound question logged

- **WHEN** a partner asks a question in Slack unprompted
- **THEN** it is appended verbatim with date, partner, prompted/unprompted flag, and classification

### Requirement: Kill-criteria scorecard

`docs/validation/scorecard.md` SHALL track the four decision gates with their thresholds and decision rules: A1 (instrumentation PRs merged; red ≤ 2/5), A2 (partners asking ≥ 2 unprompted questions by week 4; red ≤ 1/5 — decides company vs. consulting gig), A3 (share of questions that are agent-shaped; < 25% → pivot positioning), and WTP (green ≥ 2 partners naming ≥ $200/mo). It SHALL include a weekly history section and the Sean Ellis exit-interview result.

#### Scenario: Weekly scorecard update

- **WHEN** the weekly ritual runs
- **THEN** each gate's current value is recorded against its threshold with a green/yellow/red status and the decision rule it triggers
