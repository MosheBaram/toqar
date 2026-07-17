import { describe, expect, it } from 'vitest';
import type { MonitorResult } from './agent.js';
import { runGuardedRollout, type GuardedRolloutOptions, type RolloutPolicy } from './rollout.js';

const policy: RolloutPolicy = {
  change_classes: ['flag_rollout', 'prompt_variant'],
  max_traffic_share: 0.1,
  protected_task_types: ['payments'],
  max_concurrent: 2,
};

const request = {
  experiment_id: 'exp_1',
  flag_key: 'variant-x',
  change_class: 'flag_rollout',
  task_type: 'reply_to_lead',
  canary_share: 0.5, // above the cap — must clamp
};

function harness(overrides: Partial<GuardedRolloutOptions> = {}) {
  const shares: number[] = [];
  const audits: { action: string; detail: Record<string, unknown> }[] = [];
  const opts: GuardedRolloutOptions = {
    autonomyLevel: async () => 3,
    policy,
    activeAutonomousRollouts: 0,
    request,
    flags: { setRolloutShare: async (_k, share) => void shares.push(share) },
    audit: { record: async (action, detail) => void audits.push({ action, detail }) },
    monitor: async () => ({ status: 'inconclusive' }) as MonitorResult,
    maxChecks: 3,
    ...overrides,
  };
  return { opts, shares, audits };
}

describe('runGuardedRollout (spec: autonomous-rollout)', () => {
  it('level 2 NEVER auto-promotes — audited human fallback, no exposure', async () => {
    const { opts, shares, audits } = harness({ autonomyLevel: async () => 2 });
    const result = await runGuardedRollout(opts);
    expect(result.outcome).toBe('requires_human');
    expect(shares).toEqual([]); // never touched the flag
    expect(audits[0]!.action).toBe('rollout_requires_human');
  });

  it('out-of-class and protected-task changes fall back to a human, audited', async () => {
    const { opts: a } = harness({ request: { ...request, change_class: 'schema_change' } });
    expect((await runGuardedRollout(a)).outcome).toBe('requires_human');
    const { opts: b } = harness({ request: { ...request, task_type: 'payments' } });
    expect((await runGuardedRollout(b)).outcome).toBe('requires_human');
    const { opts: c } = harness({ activeAutonomousRollouts: 2 });
    expect((await runGuardedRollout(c)).outcome).toBe('requires_human');
  });

  it('canary exposure clamps to the blast-radius cap', async () => {
    const { opts, shares } = harness();
    await runGuardedRollout(opts);
    expect(shares[0]).toBe(0.1); // requested 0.5, policy caps at 0.1
  });

  it('a guardrail breach auto-rolls-back immediately, audited with the breach', async () => {
    const monitors: MonitorResult[] = [{ status: 'inconclusive' }, { status: 'stopped', breached: ['override_rate'] }];
    const { opts, shares, audits } = harness({ monitor: async () => monitors.shift()! });
    const result = await runGuardedRollout(opts);
    expect(result).toMatchObject({ outcome: 'rolled_back', checks: 2 });
    expect(shares).toEqual([0.1, 0]); // canary then rollback
    const rollback = audits.find((a) => a.action === 'rollout_auto_rollback');
    expect(rollback!.detail.breached).toEqual(['override_rate']);
  });

  it('a valid win auto-promotes to full rollout, audited', async () => {
    const { opts, shares, audits } = harness({
      monitor: async () => ({ status: 'concluded', decision: 'ship' }) as MonitorResult,
    });
    const result = await runGuardedRollout(opts);
    expect(result).toMatchObject({ outcome: 'promoted', checks: 1 });
    expect(shares).toEqual([0.1, 1]);
    expect(audits.some((a) => a.action === 'rollout_auto_promoted')).toBe(true);
  });

  it('kill switch: revoking level 3 mid-rollout halts safely (rolls back by default)', async () => {
    const levels = [3, 3, 1]; // grant at start + first check, revoked before the second
    const { opts, shares, audits } = harness({ autonomyLevel: async () => levels.shift() ?? 1 });
    const result = await runGuardedRollout(opts);
    expect(result).toMatchObject({ outcome: 'halted', reason: 'autonomy_revoked' });
    expect(shares.at(-1)).toBe(0);
    expect(audits.some((a) => a.action === 'rollout_halted')).toBe(true);
  });

  it('an inconclusive canary is a human decision — frozen, audited, never guessed', async () => {
    const { opts, shares, audits } = harness();
    const result = await runGuardedRollout(opts);
    expect(result.outcome).toBe('requires_human');
    expect(shares).toEqual([0.1]); // canary left in place for review
    expect(audits.at(-1)!.action).toBe('rollout_requires_human');
  });
});
