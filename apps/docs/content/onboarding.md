<!-- claims: events=task_started -->
# Onboarding

`toqar onboard <repo>` connects your repository, the instrumentation
agent maps your agent loop and proposes a tracking plan (starting with
`task_started` at your task entry points), you approve it, and the
instrumentation PR lands. Data flows after merge; the first finding
arrives once there is enough to defend. Time-to-first-finding is measured.
