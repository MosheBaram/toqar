import { describe, expect, it } from 'vitest';
import { findingSchema, validateFindingCitations } from './finding.js';

function draft(overrides: Record<string, unknown> = {}) {
  return {
    layer: 'T',
    severity: 'critical',
    variant: 'regression',
    headline: 'Task success dropped to 62.0% after the v42 bump.',
    summary:
      'Verified success sits at 41.6%. 84% of newly failed runs end at crm_lookup.',
    metrics: [
      { label: 'task_success_rate', value: '62.0%', query_id: 'q_1111111111111111' },
      { label: 'verified_success_rate', value: '41.6%', query_id: 'q_2222222222222222' },
      { label: 'failed_at_crm_share', value: '84%', query_id: 'q_3333333333333333' },
    ],
    evidence: [
      {
        title: 'Compare TSR across agent versions',
        note: 'Drop aligns with the v42 deploy.',
        query_id: 'q_1111111111111111',
      },
    ],
    ...overrides,
  };
}

describe('findingSchema', () => {
  it('accepts a complete finding draft', () => {
    expect(findingSchema.safeParse(draft()).success).toBe(true);
  });

  it('requires a query id on every metric and evidence step', () => {
    const noMetricId = draft();
    (noMetricId.metrics[0] as Record<string, unknown>).query_id = undefined;
    expect(findingSchema.safeParse(noMetricId).success).toBe(false);

    const noStepId = draft();
    (noStepId.evidence[0] as Record<string, unknown>).query_id = undefined;
    expect(findingSchema.safeParse(noStepId).success).toBe(false);
  });
});

describe('validateFindingCitations', () => {
  it('passes when every prose number matches a registered metric value', () => {
    expect(validateFindingCitations(draft())).toEqual({ ok: true });
  });

  it('rejects a numeric claim with no registered citation', () => {
    const result = validateFindingCitations(
      draft({ summary: 'Cost per task rose to $0.55 this week.' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.uncited).toContain('$0.55');
    }
  });

  it('ignores non-claim numerics like version tags and query ids', () => {
    const result = validateFindingCitations(
      draft({ summary: 'The v42 deploy (see q_1111111111111111) caused the 62.0% drop.' }),
    );
    expect(result.ok).toBe(true);
  });
});
