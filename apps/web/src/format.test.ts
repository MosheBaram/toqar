import { describe, expect, it } from 'vitest';
import { formatEventName } from './format.js';

describe('formatEventName — canonical TOQAR names (spec: findings-feed)', () => {
  it('maps known display aliases to canonical core events', () => {
    expect(formatEventName('human_takeover')).toBe('human_overrode');
    expect(formatEventName('run_abandoned')).toBe('task_abandoned');
    expect(formatEventName('tool_called')).toBe('step_executed');
  });

  it('passes canonical and product-specific names through untouched', () => {
    expect(formatEventName('human_overrode')).toBe('human_overrode');
    expect(formatEventName('meeting_booked')).toBe('meeting_booked');
  });
});
