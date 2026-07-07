# Tracking Plan — {{repo}}

Generated: {{iso_timestamp}} · Schema: TOQAR 0.1.0 · Status: proposed

{{one-paragraph summary: what this instruments and which of the
partner's three questions it will make answerable}}

## Your three questions, and the events that answer them

1. "{{question 1 verbatim}}" → {{events + metric}}
2. "{{question 2 verbatim}}" → {{events + metric}}
3. "{{question 3 verbatim}}" → {{events + metric}}

## Added events

| Event | Journey | Owner metric | Status |
| --- | --- | --- | --- |
| `{{event}}` | {{journey}} | {{owner_metric}} | proposed |

### `{{event}}`

{{description}}
- Hypothesis: {{hypothesis}}
- Owner metric: {{owner_metric}}
- Code locations: `{{file:line}}`
- Implementation: {{notes}}

{{repeat per event}}

## Privacy

No raw user content, prompts, or model outputs are captured. Sensitive
payloads are referenced by ID (`*_ref` fields) into your own storage.

## Review checklist for you

- [ ] Task taxonomy names match how you talk about the product
- [ ] Every event's owner metric is one you actually want
- [ ] Code locations look like the right seams
- [ ] Nothing here captures content you consider sensitive
