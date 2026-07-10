import { createSequentialTest, evaluate, type Arm } from '@toqar/experiments';
import type { Finding } from '@toqar/registry';

/**
 * The experiment agent (spec: experiment-agent): the closed loop. A finding
 * becomes a hypothesis, a variant ships as a reviewed PR gated on autonomy
 * level 2, sequential-stats monitor the target and guardrails continuously,
 * and the verdict is written to the registry and surfaced as a finding.
 *
 * No statistics are computed by an LLM — every number comes from
 * @toqar/experiments over real per-arm data. No verdict before the sequence
 * concludes; no variant is auto-merged.
 */

export const AGENT_VERSION = 'experiment-agent@0.1.0';

export interface Hypothesis {
  hypothesis: string;
  target_metric: string;
  direction: 'increase' | 'decrease';
  from_finding_id?: string;
  from_query_ids: string[];
  guardrails: string[];
  flag_provider: 'posthog' | 'launchdarkly';
}

export interface ExperimentClient {
  getAutonomyLevel(): Promise<number>;
  createExperiment(exp: Hypothesis): Promise<{ experiment_id: string }>;
  updateExperiment(id: string, status: { status: string; variant_pr_url?: string }): Promise<void>;
  writeVerdict(id: string, verdict: Record<string, unknown>): Promise<void>;
  publishFinding(finding: Finding): Promise<{ finding_id: string }>;
}

export interface StartOptions {
  client: ExperimentClient;
  hypothesis: Hypothesis;
  /** Reuses the instrumentation agent's PR machinery in production. */
  assembleVariantPr: () => Promise<{ branch: string; prUrl: string }>;
}

export type StartResult =
  | { status: 'refused'; reason: string }
  | { status: 'running'; experimentId: string; prUrl: string };

/** Level-2 grant is the gate for experiment PRs — no variant without it. */
export const EXPERIMENT_AUTONOMY_LEVEL = 2;

export async function startExperiment(opts: StartOptions): Promise<StartResult> {
  const level = await opts.client.getAutonomyLevel();
  if (level < EXPERIMENT_AUTONOMY_LEVEL) {
    return {
      status: 'refused',
      reason: `experiment PRs require autonomy level ${EXPERIMENT_AUTONOMY_LEVEL} — this tenant is at level ${level}`,
    };
  }
  const { experiment_id } = await opts.client.createExperiment(opts.hypothesis);
  const pr = await opts.assembleVariantPr();
  await opts.client.updateExperiment(experiment_id, { status: 'running', variant_pr_url: pr.prUrl });
  return { status: 'running', experimentId: experiment_id, prUrl: pr.prUrl };
}

/* ---------------- monitoring ---------------- */

/** Which direction of movement is harmful for each guardrail. */
const GUARDRAIL_HARM: Record<string, 'increase' | 'decrease'> = {
  override_rate: 'increase',
  cost_per_completed_task: 'increase',
  task_success_rate: 'decrease',
};

export interface ArmObservations {
  control: number[];
  variant: number[];
}

export interface MonitorOptions {
  client: ExperimentClient;
  experimentId: string;
  targetMetric: string;
  direction: 'increase' | 'decrease';
  queryIds: { target: string; guardrails: Record<string, string> };
  observations: {
    target: ArmObservations;
    guardrails: Record<string, ArmObservations>;
  };
}

export type MonitorResult =
  | { status: 'inconclusive' }
  | { status: 'concluded'; decision: 'ship' | 'revert' }
  | { status: 'stopped'; breached: string[] };

function runSequence(obs: ArmObservations) {
  const test = createSequentialTest({ alpha: 0.05 });
  const n = Math.min(obs.control.length, obs.variant.length);
  for (let i = 0; i < n; i++) {
    test.observe('control' as Arm, obs.control[i]!);
    test.observe('variant' as Arm, obs.variant[i]!);
  }
  return evaluate(test);
}

function fmtEffect(effect: number): string {
  const pts = effect * 100;
  return `${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts`;
}

export async function monitorExperiment(opts: MonitorOptions): Promise<MonitorResult> {
  // Guardrails first: a harm breach stops the experiment regardless of target.
  const breached: string[] = [];
  const guardrailOutcomes: { metric: string; breached: boolean; effect: number; query_id: string }[] = [];
  for (const [metric, obs] of Object.entries(opts.observations.guardrails)) {
    const seq = runSequence(obs);
    const harm = GUARDRAIL_HARM[metric] ?? 'increase';
    const isBreach =
      seq.decision !== 'inconclusive' &&
      ((harm === 'increase' && seq.interval.lower > 0) ||
        (harm === 'decrease' && seq.interval.upper < 0));
    if (isBreach) breached.push(metric);
    guardrailOutcomes.push({
      metric,
      breached: isBreach,
      effect: seq.effect,
      query_id: opts.queryIds.guardrails[metric] ?? opts.queryIds.target,
    });
  }

  const target = runSequence(opts.observations.target);

  if (breached.length > 0) {
    const verdict = {
      decision: 'revert' as const,
      effect: target.effect,
      interval: target.interval,
      samples: target.samples,
      guardrail_outcomes: guardrailOutcomes.map((g) => ({ metric: g.metric, breached: g.breached })),
      query_ids: [opts.queryIds.target, ...breached.map((m) => opts.queryIds.guardrails[m]!)],
    };
    await opts.client.writeVerdict(opts.experimentId, verdict);
    await opts.client.updateExperiment(opts.experimentId, { status: 'stopped' });
    await opts.client.publishFinding(
      buildExperimentFinding('revert', 'critical', opts, target, guardrailOutcomes, breached),
    );
    return { status: 'stopped', breached };
  }

  // Target decision maps by intended direction.
  const targetDecision =
    opts.direction === 'increase'
      ? target.interval.lower > 0
        ? 'ship'
        : target.interval.upper < 0
          ? 'revert'
          : 'inconclusive'
      : target.interval.upper < 0
        ? 'ship'
        : target.interval.lower > 0
          ? 'revert'
          : 'inconclusive';

  if (targetDecision === 'inconclusive') {
    return { status: 'inconclusive' };
  }

  const verdict = {
    decision: targetDecision,
    effect: target.effect,
    interval: target.interval,
    samples: target.samples,
    guardrail_outcomes: guardrailOutcomes.map((g) => ({ metric: g.metric, breached: g.breached })),
    query_ids: [opts.queryIds.target],
  };
  await opts.client.writeVerdict(opts.experimentId, verdict);
  await opts.client.updateExperiment(opts.experimentId, { status: 'concluded' });
  await opts.client.publishFinding(
    buildExperimentFinding(targetDecision, targetDecision === 'ship' ? 'positive' : 'warning', opts, target, guardrailOutcomes, []),
  );
  return { status: 'concluded', decision: targetDecision };
}

function buildExperimentFinding(
  decision: 'ship' | 'revert',
  severity: Finding['severity'],
  opts: MonitorOptions,
  target: ReturnType<typeof runSequence>,
  guardrails: { metric: string; effect: number; query_id: string }[],
  breached: string[],
): Finding {
  // All numbers live in `metrics` with query ids; prose carries no numeric
  // claims, so the citation validator holds by construction.
  const metrics = [
    { label: `${opts.targetMetric}_effect`, value: fmtEffect(target.effect), query_id: opts.queryIds.target },
    ...guardrails.map((g) => ({
      label: `${g.metric}_effect`,
      value: fmtEffect(g.effect),
      query_id: g.query_id,
    })),
  ];
  const summary =
    breached.length > 0
      ? `The variant was stopped because a guardrail breached its harm threshold (${breached.join(', ')}). Effect estimates and their queries are attached.`
      : `The sequential test concluded to ${decision} the variant. Effect estimates and their queries are attached.`;
  return {
    layer: 'T',
    severity,
    variant: 'experiment',
    headline: `Experiment verdict: ${decision} the variant for ${opts.targetMetric}.`,
    summary,
    metrics,
    evidence: [
      { title: 'Target metric sequential test', query_id: opts.queryIds.target },
      ...guardrails.map((g) => ({ title: `Guardrail: ${g.metric}`, query_id: g.query_id })),
    ],
    prompt_version: AGENT_VERSION,
  };
}
