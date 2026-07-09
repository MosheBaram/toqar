import { renderTrackingPlan, type SeamMap, type TrackingPlan } from '@toqar/registry';
import { computeCostUsd, type CostRates, type ModelSession } from './model.js';
import { buildInstrumentationPlan } from './plan-builder.js';
import { scanRepo } from './scanner.js';
import { createServiceClient } from './service-client.js';

export interface RunRecord {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model: string | null;
  agent_version: string;
  started_at: string;
}

export interface SeamChanges {
  /** True when a prior seam map existed for this repo. */
  reused: boolean;
  added: string[];
  removed: string[];
}

export type RunResult =
  | {
      status: 'plan_proposed';
      plan: TrackingPlan;
      rendered: string;
      seamMap: SeamMap;
      /** How this run's seams compare to the stored map (spec: second run reuses context). */
      seamChanges: SeamChanges;
      /** Model review of the deterministic plan — advisory, for the human reviewer. */
      suggestions?: string;
      runRecord: RunRecord;
    }
  | { status: 'unsupported'; reason: string };

export interface RunOptions {
  repoPath: string;
  repo: string;
  apiUrl: string;
  token: string;
  agentVersion: string;
  now: () => string;
  /** Omit for deterministic (zero-cost) runs. */
  session?: ModelSession;
  rates?: CostRates;
}

/**
 * Phases 1–2 of the instrumentation flow: map the repo, propose the plan,
 * persist the seam map — then STOP at the review gate. Phase 3 (writing
 * code) lives elsewhere and only ever runs on an approved plan.
 */
export async function runInstrumentation(opts: RunOptions): Promise<RunResult> {
  const startedAt = opts.now();

  const scan = await scanRepo(opts.repoPath, {
    repo: opts.repo,
    agentVersion: opts.agentVersion,
    now: opts.now,
  });
  if (!scan.supported) {
    return { status: 'unsupported', reason: scan.reason };
  }

  const client = createServiceClient(opts.apiUrl, opts.token);
  const previous = await client.getSeamMap(opts.repo);
  const prevLocations = new Set(previous?.seams.map((s) => `${s.kind}@${s.location}`) ?? []);
  const newLocations = new Set(scan.seamMap.seams.map((s) => `${s.kind}@${s.location}`));
  const seamChanges = {
    reused: previous !== null,
    added: [...newLocations].filter((l) => !prevLocations.has(l)),
    removed: [...prevLocations].filter((l) => !newLocations.has(l)),
  };

  const { entries } = await client.fetchRegistry();
  const plan = buildInstrumentationPlan({
    seamMap: scan.seamMap,
    registry: entries,
    generatedAt: opts.now(),
  });

  let suggestions: string | undefined;
  let usage = { input_tokens: 0, output_tokens: 0 };
  if (opts.session) {
    const prompt = [
      'You are reviewing an instrumentation tracking plan produced by deterministic scanning.',
      'Point out taxonomy naming problems, missed verification opportunities, and risky seams.',
      'Respond in prose; do not restate the plan. All numbers and anchors are authoritative as given.',
      '',
      `Task taxonomy: ${scan.seamMap.task_taxonomy.join(', ')}`,
      `Frameworks: ${scan.seamMap.frameworks.join(', ')}`,
      '',
      renderTrackingPlan(plan),
    ].join('\n');
    const response = await opts.session.send(prompt);
    suggestions = response.text;
    usage = response.usage;
  }

  await client.putSeamMap(scan.seamMap);

  return {
    status: 'plan_proposed',
    plan,
    rendered: renderTrackingPlan(plan),
    seamMap: scan.seamMap,
    seamChanges,
    ...(suggestions === undefined ? {} : { suggestions }),
    runRecord: {
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
      cost_usd: opts.rates ? computeCostUsd(usage, opts.rates) : 0,
      model: opts.session?.model ?? null,
      agent_version: opts.agentVersion,
      started_at: startedAt,
    },
  };
}
