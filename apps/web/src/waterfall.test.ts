import { describe, expect, it } from 'vitest';
import { waterfallRows } from './waterfall.js';

const run = {
  outcome: 'failed',
  steps: [
    { tool_name: 'crm_lookup', model: 'claude-opus-4-8', status: 'error', latency_ms: 900, tokens_in: 400, tokens_out: 80, retry_of_step_id: '', timestamp: '2026-07-17T10:00:01.000Z' },
    { tool_name: 'crm_lookup', model: '', status: 'ok', latency_ms: 450, tokens_in: 0, tokens_out: 0, retry_of_step_id: 's1', timestamp: '2026-07-17T10:00:02.000Z' },
  ],
  human_events: [{ event: 'human_overrode', timestamp: '2026-07-17T10:00:03.000Z' }],
  totals: { steps: 2, errors: 1, retries: 1, tokens: 480, cost_usd: 0.4 },
};

describe('waterfallRows (spec: trace-explorer)', () => {
  it('time-orders steps and human events with error/retry/human highlighting', () => {
    const rows = waterfallRows(run);
    expect(rows.map((r) => r.highlight)).toEqual(['error', 'retry', 'human']);
    expect(rows[0]!.detail).toContain('900ms');
    expect(rows[0]!.detail).toContain('480 tok');
    expect(rows[0]!.detail).toContain('error');
  });

  it('bar shares scale to the slowest step, never invented', () => {
    const rows = waterfallRows(run);
    expect(rows[0]!.share).toBe(1);
    expect(rows[1]!.share).toBe(0.5);
    expect(rows[2]!.share).toBe(0); // human events have no duration bar
  });
});
