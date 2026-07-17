<!-- claims: metrics=task_success_rate,cost_per_completed_task -->
# Benchmarks

Opt-in, and only opt-in: tenants that enable benchmarking
(`PUT /v1/benchmark/optin`, audited) join anonymized cross-tenant cohorts
— how does your `task_success_rate` or `cost_per_completed_task` compare
to agents like yours? Cohorts are k-anonymized: a cohort below the
minimum tenant count publishes nothing, and published aggregates are
blended (mean/stddev/count) so no individual tenant's value is
recoverable. Opting out stops contribution immediately.

Contribution is open to every tier; **viewing cohort comparisons is a
Growth feature** (`GET /v1/benchmark/result`), and viewing also requires
that you contribute — you see the cohort you're part of. Each gate answers
by name (`benchmark_requires_growth`, `benchmark_requires_optin`), never a
silent error.

