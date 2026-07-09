import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  assemblePrBranch,
  implementPlan,
  runInstrumentation,
  createServiceClient,
  type HostCheck,
  type ModelSession,
} from '@toqar/instrumentation-agent';

export interface InstrumentConfig {
  repoPath: string;
  /** Repo label; defaults to the directory name. */
  repo?: string;
  /** The human review-gate act: without it the run stops at the plan. */
  approve: boolean;
  apiUrl?: string | undefined;
  token?: string | undefined;
  session?: ModelSession;
  now?: () => string;
}

export interface InstrumentResult {
  /** 0 done · 2 plan proposed, awaiting approval · 1 error/refusal. */
  code: number;
  output: string;
}

const AGENT_VERSION = 'instrumentation-agent@0.1.0';

/** Derives host checks from the target repo's own package.json scripts. */
async function detectHostChecks(repoPath: string): Promise<HostCheck[]> {
  try {
    const pkg = JSON.parse(await readFile(join(repoPath, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return ['typecheck', 'test']
      .filter((s) => pkg.scripts?.[s])
      .map((s) => ({ command: 'npm', args: ['run', s] }));
  } catch {
    return [];
  }
}

export async function runInstrument(cfg: InstrumentConfig): Promise<InstrumentResult> {
  if (!cfg.apiUrl) {
    return { code: 1, output: 'TOQAR_API_URL is not set — export it to point at the registry backend' };
  }
  if (!cfg.token) {
    return { code: 1, output: 'TOQAR_TOKEN is not set — export your tenant token (never commit it)' };
  }

  const repo = cfg.repo ?? basename(resolve(cfg.repoPath));
  const now = cfg.now ?? (() => new Date().toISOString());
  const lines: string[] = [];

  const runResult = await runInstrumentation({
    repoPath: cfg.repoPath,
    repo,
    apiUrl: cfg.apiUrl,
    token: cfg.token,
    agentVersion: AGENT_VERSION,
    now,
    ...(cfg.session ? { session: cfg.session } : {}),
  });

  if (runResult.status === 'unsupported') {
    return { code: 1, output: `unsupported repo: ${runResult.reason}` };
  }

  const { seamChanges } = runResult;
  lines.push(
    seamChanges.reused
      ? `seam map: reused (+${seamChanges.added.length} new, -${seamChanges.removed.length} gone)`
      : 'seam map: fresh scan (no prior map for this repo)',
  );
  lines.push('');
  lines.push(runResult.rendered);
  if (runResult.suggestions) {
    lines.push(`model review: ${runResult.suggestions}`);
  }

  if (!cfg.approve) {
    lines.push('review gate: no code written — re-run with --approve to implement this plan');
    return { code: 2, output: lines.join('\n') };
  }

  const hostChecks = await detectHostChecks(cfg.repoPath);
  if (hostChecks.length === 0) {
    lines.push('note: no typecheck/test scripts found in package.json — verify the PR manually');
  }
  const impl = await implementPlan({
    repoPath: cfg.repoPath,
    plan: runResult.plan,
    seamMap: runResult.seamMap,
    hostChecks,
    ...(cfg.session ? { session: cfg.session } : {}),
  });
  if (impl.status === 'verification_failed') {
    return {
      code: 1,
      output: [...lines, `host verification failed: ${impl.failedCheck}`, impl.output].join('\n'),
    };
  }

  const assembled = await assemblePrBranch({
    repoPath: cfg.repoPath,
    plan: runResult.plan,
    verificationCommands: hostChecks.map((c) => `${c.command} ${c.args.join(' ')}`),
  });

  const client = createServiceClient(cfg.apiUrl, cfg.token);
  const { run_id } = await client.recordRun({
    repo,
    tokens_in: runResult.runRecord.tokens_in,
    tokens_out: runResult.runRecord.tokens_out,
    cost_usd: runResult.runRecord.cost_usd,
    model: runResult.runRecord.model,
    agent_version: AGENT_VERSION,
  });

  lines.push(`implemented: ${impl.filesWritten.join(', ')} (+${impl.editsApplied.length} wired edits)`);
  lines.push(`branch ${assembled.branch} @ ${assembled.commitSha.slice(0, 8)} — push and open the PR with the body below`);
  lines.push(`run recorded: ${run_id} — update its outcome when the PR resolves`);
  lines.push('');
  lines.push(assembled.body);
  return { code: 0, output: lines.join('\n') };
}
