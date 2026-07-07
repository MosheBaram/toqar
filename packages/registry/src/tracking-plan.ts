import { z } from 'zod';

/**
 * A registry entry is an event's identity card: not just its shape, but
 * its journey and its reason for existing (design principle 3 — every
 * event serves a named metric or hypothesis).
 */
export const registryEntrySchema = z.object({
  event: z.string().min(1),
  description: z.string().min(1),
  /** The user/agent journey this event belongs to, e.g. "lead_outreach". */
  journey: z.string().min(1),
  /** The metric this event exists to serve, e.g. "task_success_rate". */
  owner_metric: z.string().min(1),
  /** The question or bet behind the metric, when there is one. */
  hypothesis: z.string().min(1).optional(),
  status: z.enum(['proposed', 'active', 'deprecated']),
  since_version: z.string().min(1),
});

/** A registry entry plus where and how it gets implemented. */
export const plannedEventSchema = registryEntrySchema.extend({
  /** "path/to/file.ts:line" anchors for every emission site. */
  code_locations: z.array(z.string().min(1)).min(1),
  implementation_notes: z.string().min(1),
});

/**
 * The tracking plan is a *diff against the registry* — the reviewable
 * artifact the instrumentation agent proposes before writing code.
 */
export const trackingPlanSchema = z.object({
  repo: z.string().min(1),
  generated_at: z.string().datetime({ offset: true }),
  summary: z.string().min(1),
  added: z.array(plannedEventSchema),
  modified: z.array(plannedEventSchema),
  removed: z.array(
    z.object({ event: z.string().min(1), reason: z.string().min(1) }),
  ),
});

export type RegistryEntry = z.infer<typeof registryEntrySchema>;
export type PlannedEvent = z.infer<typeof plannedEventSchema>;
export type TrackingPlan = z.infer<typeof trackingPlanSchema>;

function eventSection(title: string, events: PlannedEvent[]): string {
  if (events.length === 0) return '';
  const rows = events
    .map(
      (e) =>
        `| \`${e.event}\` | ${e.journey} | ${e.owner_metric} | ${e.status} |`,
    )
    .join('\n');
  const details = events
    .map((e) => {
      const hypothesis = e.hypothesis ? `\n- Hypothesis: ${e.hypothesis}` : '';
      const locations = e.code_locations.map((l) => `\`${l}\``).join(', ');
      return [
        `### \`${e.event}\``,
        '',
        e.description + hypothesis,
        `- Owner metric: ${e.owner_metric}`,
        `- Code locations: ${locations}`,
        `- Implementation: ${e.implementation_notes}`,
      ].join('\n');
    })
    .join('\n\n');
  return [
    `## ${title}`,
    '',
    '| Event | Journey | Owner metric | Status |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    details,
    '',
  ].join('\n');
}

/** Render a tracking plan as the human-reviewable markdown document. */
export function renderTrackingPlan(plan: TrackingPlan): string {
  const removed =
    plan.removed.length === 0
      ? ''
      : [
          '## Removed events',
          '',
          ...plan.removed.map((r) => `- \`${r.event}\` — ${r.reason}`),
          '',
        ].join('\n');
  return [
    `# Tracking Plan — ${plan.repo}`,
    '',
    `Generated: ${plan.generated_at}`,
    '',
    plan.summary,
    '',
    eventSection('Added events', plan.added),
    eventSection('Modified events', plan.modified),
    removed,
  ]
    .filter((s) => s !== '')
    .join('\n')
    .concat('\n');
}
