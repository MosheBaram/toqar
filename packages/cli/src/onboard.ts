import { basename, resolve } from 'node:path';
import { runInstrumentation } from '@toqar/instrumentation-agent';

/**
 * Self-serve onboarding orchestration (spec: onboarding): connect → the
 * instrumentation agent proposes a plan → (approve, out of band) → data
 * flows. Milestones are recorded from real system state; an unsupported
 * repo is refused at connect before any plan is proposed. No step is ever
 * a scripted success.
 */

export interface OnboardConfig {
  repoPath: string;
  repo?: string;
  apiUrl?: string | undefined;
  token?: string | undefined;
  now?: () => string;
}

export interface OnboardResult {
  /** 0 done · 2 plan proposed (awaiting approval) · 1 error/refusal. */
  code: number;
  output: string;
}

const AGENT_VERSION = 'instrumentation-agent@0.1.0';

export async function runOnboard(cfg: OnboardConfig): Promise<OnboardResult> {
  if (!cfg.apiUrl) return { code: 1, output: 'TOQAR_API_URL is not set' };
  if (!cfg.token) return { code: 1, output: 'TOQAR_TOKEN is not set — export your tenant token' };

  const repo = cfg.repo ?? basename(resolve(cfg.repoPath));
  const now = cfg.now ?? (() => new Date().toISOString());
  const headers = { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' };
  const milestone = async (name: string) => {
    await fetch(`${cfg.apiUrl}/v1/onboarding/milestone`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ milestone: name, at: now() }),
    });
  };

  // Connect is real the moment we can read the repo — record it before the scan.
  await milestone('connected');

  const run = await runInstrumentation({
    repoPath: cfg.repoPath,
    repo,
    apiUrl: cfg.apiUrl,
    token: cfg.token,
    agentVersion: AGENT_VERSION,
    now,
  });

  if (run.status === 'unsupported') {
    // Refused at connect — no plan milestone, honest stop.
    return { code: 1, output: `unsupported repo: ${run.reason}` };
  }

  await milestone('plan_proposed');
  return {
    code: 2,
    output: [
      run.rendered,
      'review gate: approve the plan and merge the instrumentation PR — data starts flowing after merge',
    ].join('\n'),
  };
}
