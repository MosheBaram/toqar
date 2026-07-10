import { validateFindingCitations, type Finding } from '@toqar/registry';
import { describe, expect, it, vi } from 'vitest';
import { monitorExperiment, startExperiment, type ExperimentClient } from './agent.js';

function fakeClient(level: number, published: Finding[] = []): ExperimentClient & {
  experiments: Record<string, unknown>[];
  verdicts: Record<string, unknown>[];
  transitions: string[];
  published: Finding[];
} {
  const experiments: Record<string, unknown>[] = [];
  const verdicts: Record<string, unknown>[] = [];
  const transitions: string[] = [];
  return {
    experiments,
    verdicts,
    transitions,
    published,
    async getAutonomyLevel() {
      return level;
    },
    async createExperiment(exp) {
      experiments.push(exp);
      return { experiment_id: `exp_${experiments.length}` };
    },
    async updateExperiment(_id, status) {
      transitions.push(status.status);
    },
    async writeVerdict(_id, verdict) {
      verdicts.push(verdict as Record<string, unknown>);
    },
    async publishFinding(finding) {
      published.push(finding);
      return { finding_id: `f_${published.length}` };
    },
  };
}

const hypothesis = {
  hypothesis: 'retry-with-backoff on crm_lookup recovers TSR',
  target_metric: 'task_success_rate',
  direction: 'increase' as const,
  from_finding_id: 'f_source',
  from_query_ids: ['q_1111111111111111'],
  guardrails: ['override_rate'],
  flag_provider: 'posthog' as const,
};

describe('startExperiment — variant PR gated on autonomy level 2', () => {
  it('refuses at level 1 without opening a PR or creating a record', async () => {
    const client = fakeClient(1);
    const assemble = vi.fn();
    const result = await startExperiment({ client, hypothesis, assembleVariantPr: assemble });
    expect(result.status).toBe('refused');
    if (result.status === 'refused') expect(result.reason).toContain('level 2');
    expect(assemble).not.toHaveBeenCalled();
    expect(client.experiments).toHaveLength(0);
  });

  it('at level 2 creates a cited experiment and assembles a reviewed variant PR', async () => {
    const client = fakeClient(2);
    const assemble = vi.fn(async () => ({ branch: 'analytics/exp', prUrl: 'https://github.com/x/pull/9' }));
    const result = await startExperiment({ client, hypothesis, assembleVariantPr: assemble });
    expect(result.status).toBe('running');
    expect(assemble).toHaveBeenCalledOnce();
    expect(client.experiments[0]!.from_query_ids).toEqual(['q_1111111111111111']);
    expect(client.transitions).toContain('running');
  });
});

describe('monitorExperiment — sequential test + guardrails', () => {
  const window = { experimentId: 'exp_1', targetMetric: 'task_success_rate', direction: 'increase' as const };

  it('ships when the target concludes positively and guardrails hold', async () => {
    const client = fakeClient(2);
    const result = await monitorExperiment({
      client,
      ...window,
      queryIds: { target: 'q_2222222222222222', guardrails: { override_rate: 'q_3333333333333333' } },
      observations: {
        target: { control: Array(2000).fill(0.5).map((_, i) => (i % 2)), variant: Array(2000).fill(0).map((_, i) => (i % 100 < 62 ? 1 : 0)) },
        guardrails: { override_rate: { control: Array(2000).fill(0.06).map((_, i) => (i % 100 < 6 ? 1 : 0)), variant: Array(2000).fill(0).map((_, i) => (i % 100 < 6 ? 1 : 0)) } },
      },
    });
    expect(result.status).toBe('concluded');
    if (result.status === 'concluded') expect(result.decision).toBe('ship');
    expect(client.verdicts[0]!.decision).toBe('ship');
    // surfaced as a cited experiment finding
    const finding = client.published[0]!;
    expect(finding.variant).toBe('experiment');
    expect(validateFindingCitations(finding)).toEqual({ ok: true });
  });

  it('auto-stops when a guardrail breaches even if the target improves', async () => {
    const client = fakeClient(2);
    const result = await monitorExperiment({
      client,
      ...window,
      queryIds: { target: 'q_2222222222222222', guardrails: { override_rate: 'q_3333333333333333' } },
      observations: {
        target: { control: Array(2000).fill(0).map((_, i) => (i % 100 < 50 ? 1 : 0)), variant: Array(2000).fill(0).map((_, i) => (i % 100 < 62 ? 1 : 0)) },
        // override_rate harm = increase; variant 20% vs control 5% → breach
        guardrails: { override_rate: { control: Array(2000).fill(0).map((_, i) => (i % 100 < 5 ? 1 : 0)), variant: Array(2000).fill(0).map((_, i) => (i % 100 < 20 ? 1 : 0)) } },
      },
    });
    expect(result.status).toBe('stopped');
    expect(client.verdicts[0]!.decision).toBe('revert');
    expect((client.verdicts[0]!.guardrail_outcomes as { metric: string; breached: boolean }[]).some((g) => g.breached)).toBe(true);
    expect(client.transitions).toContain('stopped');
  });

  it('stays inconclusive with insufficient data — no verdict, no fabricated winner', async () => {
    const client = fakeClient(2);
    const result = await monitorExperiment({
      client,
      ...window,
      queryIds: { target: 'q_2222222222222222', guardrails: {} },
      observations: {
        target: { control: [1, 0, 1], variant: [1, 1, 0] },
        guardrails: {},
      },
    });
    expect(result.status).toBe('inconclusive');
    expect(client.verdicts).toHaveLength(0);
    expect(client.published).toHaveLength(0);
  });
});
