import { describe, expect, it } from 'vitest';
import { compileRunQuery, reconstructRun } from './runs.js';

const row = (event: string, ts: string, extra: Record<string, unknown> = {}) => ({
  event,
  timestamp: ts,
  agent_name: 'sdr-agent',
  tool_name: '',
  model: '',
  status: '',
  latency_ms: 0,
  tokens_in: 0,
  tokens_out: 0,
  cost_usd: 0,
  retry_of_step_id: '',
  session_id: '',
  task_type: 'reply_to_lead',
  ...extra,
});

describe('compileRunQuery', () => {
  it('is tenant-scoped, parameterized, cited, and time-ordered', () => {
    const q = compileRunQuery({ tenantId: 't_1', taskId: 'task_9', runId: 'run_1' });
    expect(q.sql).toContain('{tenantId:String}');
    expect(q.sql).toContain('ORDER BY timestamp');
    expect(q.id).toMatch(/^q_[0-9a-f]{16}$/);
    expect(() => compileRunQuery({ tenantId: '', taskId: 't', runId: 'r' })).toThrow(/tenant/);
  });
});

describe('reconstructRun', () => {
  const rows = [
    row('task_started', '2026-07-17T10:00:00.000Z', { initiator: 'schedule' }),
    row('step_executed', '2026-07-17T10:00:01.000Z', { tool_name: 'crm_lookup', status: 'error', latency_ms: 900, model: 'claude-opus-4-8', tokens_in: 400, tokens_out: 80 }),
    row('step_executed', '2026-07-17T10:00:02.000Z', { tool_name: 'crm_lookup', status: 'ok', latency_ms: 400, retry_of_step_id: 's1', agent_name: 'crm-subagent' }),
    row('human_overrode', '2026-07-17T10:00:03.000Z'),
    row('task_completed', '2026-07-17T10:00:04.000Z', { cost_usd: 0.4 }),
  ];
  const run = reconstructRun({ taskId: 'task_9', runId: 'run_1' }, rows);

  it('orders steps with error/retry context and totals that add up', () => {
    expect(run.outcome).toBe('completed');
    expect(run.steps).toHaveLength(2);
    expect(run.steps[0]).toMatchObject({ tool_name: 'crm_lookup', status: 'error', latency_ms: 900 });
    expect(run.steps[1]!.retry_of_step_id).toBe('s1');
    expect(run.totals).toEqual({ steps: 2, errors: 1, retries: 1, tokens: 480, cost_usd: 0.4 });
    expect(run.human_events).toEqual([{ event: 'human_overrode', timestamp: '2026-07-17T10:00:03.000Z' }]);
  });

  it('models sub-agents first-class (root first, then by appearance)', () => {
    expect(run.agents).toEqual(['sdr-agent', 'crm-subagent']);
  });

  it('headless runs carry no fabricated session', () => {
    expect(run.session_id).toBeNull();
    const withSession = reconstructRun({ taskId: 't', runId: 'r' }, [row('task_started', '2026-07-17T10:00:00.000Z', { session_id: 's_1' })]);
    expect(withSession.session_id).toBe('s_1');
  });

  it('exposes the evals-compatible trajectory (one schema, both consumers)', () => {
    expect(run.trajectory.completed).toBe(true);
    expect(run.trajectory.steps.map((s) => s.event)).toEqual([
      'task_started',
      'step_executed',
      'step_executed',
      'human_overrode',
      'task_completed',
    ]);
  });

  it('an unfinished run is in_flight, never guessed', () => {
    const open = reconstructRun({ taskId: 't', runId: 'r' }, [row('task_started', '2026-07-17T10:00:00.000Z')]);
    expect(open.outcome).toBe('in_flight');
  });
});
