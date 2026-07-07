import { describe, expect, it } from 'vitest';
import {
  renderTrackingPlan,
  type TrackingPlan,
  trackingPlanSchema,
} from './tracking-plan.js';

const plan: TrackingPlan = {
  repo: 'acme/sdr-agent',
  generated_at: '2026-07-07T12:00:00.000Z',
  summary: 'Wire the 10 TOQAR core events plus 2 product events.',
  added: [
    {
      event: 'task_started',
      description: 'An outreach task begins for a lead.',
      journey: 'lead_outreach',
      owner_metric: 'task_success_rate',
      hypothesis: 'TSR for cold outreach is below 60%.',
      status: 'proposed',
      since_version: '0.1.0',
      code_locations: ['src/workers/outreach.ts:42'],
      implementation_notes: 'Emit at the top of the queue consumer.',
    },
  ],
  modified: [],
  removed: [],
};

describe('trackingPlanSchema', () => {
  it('accepts a valid plan', () => {
    expect(trackingPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects a planned event without code_locations', () => {
    const first = plan.added[0]!;
    const { code_locations, ...bare } = first;
    const bad = { ...plan, added: [bare] };
    expect(trackingPlanSchema.safeParse(bad).success).toBe(false);
  });
});

describe('renderTrackingPlan', () => {
  it('renders repo, summary, and one row per added event', () => {
    const md = renderTrackingPlan(plan);
    expect(md).toContain('# Tracking Plan — acme/sdr-agent');
    expect(md).toContain(plan.summary);
    expect(md).toContain('`task_started`');
    expect(md).toContain('task_success_rate');
    expect(md).toContain('src/workers/outreach.ts:42');
  });

  it('omits empty sections', () => {
    const md = renderTrackingPlan(plan);
    expect(md).not.toContain('## Modified events');
    expect(md).not.toContain('## Removed events');
  });
});
