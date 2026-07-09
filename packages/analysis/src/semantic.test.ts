import { describe, expect, it } from 'vitest';
import { compileMetric, listMetrics, METRICS } from './semantic.js';

const args = {
  tenantId: 't_1',
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-08T00:00:00.000Z',
};

/**
 * The headline metrics from packages/registry/README.md's five layers —
 * the catalog completeness contract (spec: semantic-layer).
 */
const README_HEADLINE_METRICS: Record<string, string[]> = {
  T: ['task_success_rate', 'overclaim_rate', 'first_run_resolution', 'abandonment_rate'],
  O: ['cost_per_completed_task', 'tokens_per_task', 'steps_per_task', 'latency_p95', 'loop_retry_ratio', 'per_tool_failure_rate'],
  Q: ['human_edit_distance', 'regression_delta', 'complaint_rate'],
  A: ['autonomy_rate', 'escalation_rate', 'override_rate', 'approval_friction'],
  R: ['weekly_task_actors', 'task_depth_expansion', 'delegation_share', 'net_task_growth'],
};

describe('catalog completeness', () => {
  it('defines every README headline metric with its layer', () => {
    for (const [layer, names] of Object.entries(README_HEADLINE_METRICS)) {
      for (const name of names) {
        const metric = METRICS[name];
        expect(metric, `missing metric: ${name}`).toBeDefined();
        expect(metric!.layer).toBe(layer);
      }
    }
    expect(listMetrics().length).toBe(Object.values(README_HEADLINE_METRICS).flat().length);
  });
});

describe('compiled queries', () => {
  it('every metric compiles to tenant-scoped, parameterized, FINAL-reading SQL', () => {
    for (const name of Object.keys(METRICS)) {
      const q = compileMetric(name, { ...args, pivot: '2026-07-04T00:00:00.000Z' });
      expect(q.sql, name).toContain('{tenantId:String}');
      expect(q.sql, name).toContain('FROM toqar.events FINAL');
      expect(q.sql, name).toContain('{from:DateTime64(3)}');
      expect(q.sql, name).toContain('{to:DateTime64(3)}');
      expect(q.params.tenantId).toBe('t_1');
      expect(q.metric).toBe(name);
      expect(q.id).toMatch(/^q_[0-9a-f]{16}$/);
    }
  });

  it('query ids are stable for identical computations and change with inputs', () => {
    const a = compileMetric('task_success_rate', args);
    const b = compileMetric('task_success_rate', args);
    const c = compileMetric('task_success_rate', { ...args, tenantId: 't_2' });
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
  });

  it('segmentation is a parameter, not string soup', () => {
    const plain = compileMetric('task_success_rate', args);
    const segmented = compileMetric('task_success_rate', { ...args, segmentBy: 'task_type' });
    expect(plain.sql).not.toContain('GROUP BY');
    expect(segmented.sql).toContain('GROUP BY task_type');
    expect(segmented.id).not.toBe(plain.id);
  });

  it('rejects unknown metrics and unknown segment dimensions', () => {
    expect(() => compileMetric('vibes_per_task', args)).toThrow(/unknown metric/);
    expect(() =>
      compileMetric('task_success_rate', { ...args, segmentBy: 'payload; DROP TABLE' as never }),
    ).toThrow(/segment/);
  });

  it('task_success_rate computes completed over all ended tasks', () => {
    const q = compileMetric('task_success_rate', args);
    expect(q.sql).toContain("countIf(event = 'task_completed')");
    expect(q.sql).toContain("event IN ('task_completed', 'task_failed', 'task_abandoned')");
  });

  it('cost_per_completed_task divides all cost by completions', () => {
    const q = compileMetric('cost_per_completed_task', args);
    expect(q.sql).toContain("JSONExtractFloat(payload, 'cost_usd')");
    expect(q.sql).toContain("countIf(event = 'task_completed')");
  });

  it('regression_delta takes a pivot parameter', () => {
    const q = compileMetric('regression_delta', { ...args, pivot: '2026-07-04T00:00:00.000Z' });
    expect(q.sql).toContain('{pivot:DateTime64(3)}');
    expect(q.params.pivot).toBe('2026-07-04T00:00:00.000Z');
  });

  it('weekly_task_actors documents its session_id proxy honestly', () => {
    expect(METRICS.weekly_task_actors!.note).toContain('session_id');
  });
});
