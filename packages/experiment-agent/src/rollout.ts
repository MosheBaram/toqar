import type { MonitorResult } from './agent.js';

/**
 * The guardrailed closed loop (spec: autonomous-rollout) — the last mile
 * no competitor ships. Autonomy level 3 means: canary within tenant-
 * declared blast-radius limits → the always-valid sequential monitor →
 * auto-promote only on a statistically valid win with no guardrail
 * breach → immediate auto-rollback on a breach — with a kill switch
 * re-checked at every step. Anything outside the tenant's declared change
 * classes falls back to the human-gated path. Every transition is
 * audited; the verdict's citation-backed statistics land in the registry
 * via the monitor exactly as they do for human-gated experiments.
 */

export interface RolloutPolicy {
  /** Tenant-declared classes autonomous action may touch (e.g. flag_rollout, prompt_variant). */
  change_classes: string[];
  /** Canary traffic cap, 0..1. */
  max_traffic_share: number;
  /** Task types autonomous rollouts must never touch. */
  protected_task_types: string[];
  /** Concurrent autonomous changes cap. */
  max_concurrent: number;
}

export interface RolloutRequest {
  experiment_id: string;
  flag_key: string;
  change_class: string;
  task_type: string;
  /** Requested canary share; clamped to the policy cap. */
  canary_share: number;
}

export interface RolloutFlags {
  setRolloutShare(flagKey: string, share: number): Promise<void>;
}

export interface RolloutAudit {
  record(action: string, detail: Record<string, unknown>): Promise<void>;
}

export type RolloutOutcome =
  | { outcome: 'requires_human'; reason: string }
  | { outcome: 'promoted'; checks: number }
  | { outcome: 'rolled_back'; reason: string; checks: number }
  | { outcome: 'halted'; reason: 'autonomy_revoked'; checks: number };

export interface GuardedRolloutOptions {
  /** Kill switch: the CURRENT grant, re-read every step — a revocation mid-flight halts. */
  autonomyLevel: () => Promise<number>;
  policy: RolloutPolicy;
  activeAutonomousRollouts: number;
  request: RolloutRequest;
  flags: RolloutFlags;
  audit: RolloutAudit;
  /** One monitoring pass over fresh observations (the sequential verdict). */
  monitor: () => Promise<MonitorResult>;
  /** Monitoring passes before an inconclusive canary is handed to a human. */
  maxChecks?: number;
  /** What a halt does with the canary: roll back (default) or freeze it. */
  onHalt?: 'rollback' | 'freeze';
}

export async function runGuardedRollout(opts: GuardedRolloutOptions): Promise<RolloutOutcome> {
  const { request, policy } = opts;

  // Level 3 is an explicit grant; below it, nothing auto-promotes — ever.
  if ((await opts.autonomyLevel()) < 3) {
    const reason = 'autonomy level below 3 — human-gated path';
    await opts.audit.record('rollout_requires_human', { ...request, reason });
    return { outcome: 'requires_human', reason };
  }
  // Declared change classes and blast-radius limits, checked before any exposure.
  if (!policy.change_classes.includes(request.change_class)) {
    const reason = `change class ${request.change_class} not declared for autonomous rollout`;
    await opts.audit.record('rollout_requires_human', { ...request, reason });
    return { outcome: 'requires_human', reason };
  }
  if (policy.protected_task_types.includes(request.task_type)) {
    const reason = `task type ${request.task_type} is protected`;
    await opts.audit.record('rollout_requires_human', { ...request, reason });
    return { outcome: 'requires_human', reason };
  }
  if (opts.activeAutonomousRollouts >= policy.max_concurrent) {
    const reason = `max concurrent autonomous rollouts (${policy.max_concurrent}) reached`;
    await opts.audit.record('rollout_requires_human', { ...request, reason });
    return { outcome: 'requires_human', reason };
  }

  const canaryShare = Math.min(request.canary_share, policy.max_traffic_share);
  await opts.flags.setRolloutShare(request.flag_key, canaryShare);
  await opts.audit.record('rollout_canary_started', { ...request, canary_share: canaryShare });

  const maxChecks = opts.maxChecks ?? 20;
  for (let check = 1; check <= maxChecks; check++) {
    // Kill switch: a mid-flight revocation halts safely per policy.
    if ((await opts.autonomyLevel()) < 3) {
      const halt = opts.onHalt ?? 'rollback';
      if (halt === 'rollback') await opts.flags.setRolloutShare(request.flag_key, 0);
      await opts.audit.record('rollout_halted', { ...request, reason: 'autonomy_revoked', action: halt, checks: check });
      return { outcome: 'halted', reason: 'autonomy_revoked', checks: check };
    }

    const result = await opts.monitor();

    if (result.status === 'stopped') {
      // Guardrail breach: immediate rollback, no human in the loop needed
      // to make it safe. The breach verdict (cited) is already in the
      // registry via the monitor.
      await opts.flags.setRolloutShare(request.flag_key, 0);
      await opts.audit.record('rollout_auto_rollback', { ...request, breached: result.breached, checks: check });
      return { outcome: 'rolled_back', reason: `guardrail breach: ${result.breached.join(', ')}`, checks: check };
    }
    if (result.status === 'concluded') {
      if (result.decision === 'ship') {
        await opts.flags.setRolloutShare(request.flag_key, 1);
        await opts.audit.record('rollout_auto_promoted', { ...request, checks: check });
        return { outcome: 'promoted', checks: check };
      }
      await opts.flags.setRolloutShare(request.flag_key, 0);
      await opts.audit.record('rollout_auto_rollback', { ...request, reason: 'verdict: revert', checks: check });
      return { outcome: 'rolled_back', reason: 'verdict: revert', checks: check };
    }
    // inconclusive → keep monitoring within the check budget.
  }

  // An inconclusive canary is a human decision, not an autonomous one.
  const reason = `inconclusive after ${maxChecks} checks — canary left at ${canaryShare} for human review`;
  await opts.audit.record('rollout_requires_human', { ...request, reason });
  return { outcome: 'requires_human', reason };
}
