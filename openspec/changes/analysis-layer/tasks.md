# Tasks — Analysis Layer

> TDD; primitives extracted from quarry per design D3. Groups 1–2 need no infrastructure; group 3's execution tests ride 1.3's compose job.

## 1. Package + primitives (spec: analysis-primitives)

- [x] 1.1 Scaffold `packages/analysis` (zero runtime deps beyond zod; no Anthropic, ever)
- [x] 1.2 TDD anomaly detection (z/MAD/IQR, rolling baselines) — extract from `quarry/anomaly-detection.ts`, sever imports, provenance docblock
- [x] 1.3 TDD changepoint detection (step location + magnitude + significance)
- [x] 1.4 TDD segmentation drill-down (contribution ranking) and correlation ranking (aligned windows, coefficients-not-causality)
- [x] 1.5 TDD gap handling: missing windows explicit everywhere (no interpolation)
- [x] 1.6 Commit, PR, merge

## 2. Semantic layer (spec: semantic-layer)

- [x] 2.1 Query-AST helpers + `QueryExecutor` seam (D1, D4)
- [x] 2.2 TDD T-layer metrics (TSR, Overclaim, First-Run Resolution, Abandonment) — golden SQL + fixture arithmetic
- [x] 2.3 TDD O-layer (CPCT with failed-runs-in-numerator, tokens/steps trends, latency distributions, Loop/Retry, per-tool failure)
- [x] 2.4 TDD Q-layer (Human Edit Distance, Regression Delta around agent.version/model change, complaint rate)
- [x] 2.5 TDD A-layer (Autonomy Rate, Escalation, Override/Takeover, Approval Friction) and R-layer (WTA, Task Depth, Delegation Share, Net Task Growth)
- [x] 2.6 Catalog completeness test: every README headline metric present; query-id content hashing (D2)
- [x] 2.7 Commit, PR, merge

## 3. Real-ClickHouse verification + close-out

- [ ] 3.1 Integration scenarios in the 1.3 compose job: seeded events → TSR/CPCT arithmetic verified on real ClickHouse
- [ ] 3.2 Executed-query record storage (resolve design open question with 1.3's schema)
- [ ] 3.3 README (catalog table, citation contract); root README; `openspec validate --strict`; commit, PR, merge
