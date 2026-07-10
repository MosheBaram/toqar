<!-- claims: events=step_executed,task_completed -->
# OpenTelemetry

Already instrumented with vanilla OpenTelemetry? Export OTLP/HTTP traces
to the collector's `/v1/traces` endpoint with your tenant token. GenAI
spans map to `step_executed`; root spans with a `toqar.outcome` attribute
map to `task_completed` (and the other task outcomes). No Toqar SDK
required.
