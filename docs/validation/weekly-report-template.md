# {{company}} — Week {{n}} insights

**Headline:** {{one sentence — the single most decision-relevant finding}}

## TOQAR snapshot

| Metric | This week | Last week | Δ |
| --- | --- | --- | --- |
| Task Success Rate ({{top task_type}}) | | | |
| Cost per Completed Task | | | |
| Autonomy Rate | | | |
| Override/Takeover Rate | | | |
| Weekly Task Actors | | | |

## Finding of the week

{{2–4 sentences: what moved, the segment drill-down, the likely cause.
Every number traces to a saved query — link it.}}

## A question you can now answer

{{pick one of their three intake questions; show the answer + query}}

## Watching next week

{{one line}}

---
*Queries: {{link to saved queries — every number in this report is
reproducible; none are estimated or modeled}}*

## Rendering (brand)

Render styled reports with `skills/toqar-design/report/WeeklyReport.jsx`
(`email` variant for the full page, `slack` for the compact card); its
`ReportData` shape maps 1:1 to the sections above. House rules from the
design system's `readme.md` apply to hand-written reports too: no emoji,
directionality via ▲ ▼ – and color, event/property names verbatim in
mono (`task_completed`, never "Task Completed"), `verified` earned /
`self_reported` neutral, and every number cites its query (`↳ q_…`).
