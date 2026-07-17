# failure-clustering Specification

## Purpose

Autonomous clustering of recurring failures and intents into cited findings — unknown failure modes surface without predefined categories; membership is computed and enumerable.

## Requirements

### Requirement: Autonomous clustering of failures and topics

The platform SHALL periodically cluster recurring failures (errors, tool failures, guardrail breaches, low eval scores, human overrides) and task intents without predefined categories, so unknown failure modes surface without anyone asking. Clustering MAY use LLM assistance to group and label; every cluster SHALL be backed by its member runs (counts and run references are recorded facts, never estimates).

#### Scenario: An unknown failure mode surfaces

- **WHEN** a new tool starts failing intermittently across tenant task types no playbook watches
- **THEN** a cluster appears naming the pattern, its member-run count, and links to member runs

#### Scenario: Cluster membership is verifiable

- **WHEN** a cluster claims N member runs
- **THEN** the N runs are enumerable and each exhibits the clustered pattern (the count is computed, not modeled)

### Requirement: Clusters become cited findings

A significant cluster SHALL flow into the findings feed as a finding whose numeric claims carry query citations like every other finding, and whose narrative labels are clearly the clustering agent's grouping (not measurements).

#### Scenario: A cluster finding passes the citation gate

- **WHEN** a cluster finding is published with a member count and an affected-metric figure
- **THEN** those numbers carry `q_<hash>` citations and the finding passes `validateFindingCitations`
