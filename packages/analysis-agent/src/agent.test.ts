import { validateFindingCitations } from '@toqar/registry';
import { describe, expect, it } from 'vitest';
import { answerQuestion } from './answer.js';
import { createFixtureExecutor } from './fixture-executor.js';
import { runSweep } from './sweep.js';

const WINDOW = {
  tenantId: 't_1',
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-08T00:00:00.000Z',
  pivot: '2026-07-04T00:00:00.000Z',
};

describe('runSweep — regression playbook', () => {
  it('publishes a cited regression finding when TSR shifted', async () => {
    const executor = createFixtureExecutor({
      task_success_rate: [{ value: 0.62, ended_tasks: 672 }],
      regression_delta: [{ value: -0.092 }],
      per_tool_failure_rate: [
        { tool_name: 'crm_lookup', value: 0.84 },
        { tool_name: 'email_send', value: 0.02 },
      ],
    });
    const published: Record<string, unknown>[] = [];

    const record = await runSweep({
      executor,
      publish: async (f) => {
        published.push(f as Record<string, unknown>);
        return { finding_id: 'f_test' };
      },
      window: WINDOW,
    });

    expect(record.skipped).toBeUndefined();
    expect(record.published).toBe(1);
    expect(record.checked.length).toBeGreaterThanOrEqual(3);

    const finding = published[0]!;
    expect(finding.layer).toBe('T');
    expect(finding.variant).toBe('regression');
    // the citation contract holds on everything the sweep publishes
    expect(validateFindingCitations(finding)).toEqual({ ok: true });
    const metrics = finding.metrics as { label: string; query_id: string }[];
    expect(metrics.some((m) => m.label === 'regression_delta')).toBe(true);
    expect(executor.executed.map((q) => q.metric)).toContain('per_tool_failure_rate');
  });

  it('records an honest no-findings sweep when nothing moved', async () => {
    const executor = createFixtureExecutor({
      task_success_rate: [{ value: 0.71, ended_tasks: 500 }],
      regression_delta: [{ value: 0.004 }],
    });
    const record = await runSweep({
      executor,
      publish: async () => {
        throw new Error('nothing should publish');
      },
      window: WINDOW,
    });
    expect(record.published).toBe(0);
    expect(record.no_findings).toBe(true);
    expect(record.checked.length).toBeGreaterThanOrEqual(2);
  });

  it('skips when the window has no data, saying so', async () => {
    const executor = createFixtureExecutor({ task_success_rate: [] });
    const record = await runSweep({
      executor,
      publish: async () => {
        throw new Error('nothing should publish');
      },
      window: WINDOW,
    });
    expect(record.skipped).toBe('no_new_data');
    expect(record.published).toBe(0);
  });
});

describe('eval harness — the question log is the eval', () => {
  // Verbatim from docs/validation/question-log.md (the example entry);
  // every real inbound question becomes a case here (spec: analysis-agent).
  it('answers "why did cost per task double on tuesday" with cited queries', async () => {
    const executor = createFixtureExecutor({
      cost_per_completed_task: [{ value: 0.84, total_cost_usd: 504 }],
      regression_delta: [{ value: -0.03 }],
      per_tool_failure_rate: [
        { tool_name: 'crm_lookup', value: 0.31 },
        { tool_name: 'email_send', value: 0.02 },
      ],
      tokens_per_task: [{ value: 91_000 }],
    });

    const answer = await answerQuestion(
      'why did cost per task double on tuesday',
      executor,
      WINDOW,
    );

    expect(answer.routed_playbook).toBe('cost');
    expect(answer.query_ids.length).toBeGreaterThanOrEqual(2);
    expect(answer.text).toContain('0.84');
    expect(answer.text).toContain('crm_lookup');
    expect(executor.executed.map((q) => q.metric)).toContain('cost_per_completed_task');
    // every number in the answer is a registered, cited value
    for (const m of answer.metrics) expect(m.query_id).toMatch(/^q_/);
  });

  it('says so honestly when no playbook matches', async () => {
    const executor = createFixtureExecutor({});
    const answer = await answerQuestion('what color should the dashboard be', executor, WINDOW);
    expect(answer.routed_playbook).toBeNull();
    expect(answer.text).toContain('cannot answer');
    expect(answer.query_ids).toEqual([]);
  });
});
