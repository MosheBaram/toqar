<!-- claims: metrics=override_rate,task_success_rate -->
# Alerts

Configure alerts on any TOQAR metric or eval signal, routed to Slack or a
webhook (`POST /v1/alerts`). Three kinds:

- **Threshold** — e.g. "fire when `override_rate` exceeds 20% over 24h".
  The notification carries the actual computed value and its query id.
- **Anomaly** — the deterministic z-score primitive over a metric series
  (e.g. a `task_success_rate` excursion). The alert reflects the
  primitive's real output; no model invents a severity.
- **Eval regression** — a mean-score drop between windows for a named
  evaluator. The message is labeled as a judged, directional signal.

Every evaluation is recorded, fired or not (`GET /v1/alerts/events`). A
window with no data records "no data" — never "all clear". A failed
delivery is a visible row, never a silent swallow.
