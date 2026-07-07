# Inbound Question Log

Log every partner question verbatim, same day. This file is scoring
input for A2/A3 **and** the future analysis agent's eval set.

| Date | Partner | Question (verbatim) | Prompted? | Shape | Answered via |
| --- | --- | --- | --- | --- | --- |
| 2026-07-14 | (example) acme | "why did cost per task double on tuesday" | unprompted | agent-shaped | step_executed cost segmentation |

- **Prompted?** unprompted = they came to us; prompted = reacting to a report.
- **Shape:** agent-shaped (task success, cost/task, tool failures,
  takeover…) vs. classic (funnels, retention, page analytics).
