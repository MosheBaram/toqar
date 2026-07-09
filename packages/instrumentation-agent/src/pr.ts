import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrackingPlan } from '@toqar/registry';

const run = promisify(execFile);

/**
 * Phase 4 assembly: branch + commit + PR body. Opening the PR itself is
 * the operator's act (gh/API with their credentials) — the agent never
 * pushes to a customer remote on its own.
 */

export interface PrBodyArgs {
  plan: TrackingPlan;
  verificationCommands: string[];
}

export function buildPrBody(args: PrBodyArgs): string {
  const { plan, verificationCommands } = args;
  const events = [...plan.modified, ...plan.added];
  const core = events.filter((e) => e.journey === 'toqar_core').length;
  const product = events.length - core;
  const callSites = new Set(events.flatMap((e) => e.code_locations)).size;

  return `## TOQAR analytics instrumentation

Implements the tracking plan in \`analytics/tracking-plan.md\`
(${events.length} events: ${core} TOQAR core + ${product} product-specific).

### What this adds

- \`src/analytics.ts\` — one typed emit function per planned event; all
  delivery is fire-and-forget (analytics can never block or crash the
  agent loop).
- Call sites at ${callSites} seams (listed in the tracking plan with
  \`file:line\` anchors).

### What this does not do

- No raw prompts, outputs, or user content leave your systems — only
  IDs, enums, counts, latencies, and costs.
- No behavior changes: every insertion is additive and side-effect-free
  for your control flow.

### Verification

${verificationCommands.map((c) => `- \`${c}\` passed`).join('\n')}

### Rollback

Delete \`src/analytics.ts\` and the call sites (grep \`analytics.\`), or
set \`ANALYTICS_DISABLED=1\`.
`;
}

export interface AssembleArgs {
  repoPath: string;
  plan: TrackingPlan;
  verificationCommands: string[];
  branch?: string;
}

export interface AssembleResult {
  branch: string;
  commitSha: string;
  body: string;
}

export async function assemblePrBranch(args: AssembleArgs): Promise<AssembleResult> {
  const branch = args.branch ?? 'analytics/toqar-instrumentation';
  const cwd = args.repoPath;

  await run('git', ['checkout', '-b', branch], { cwd });
  await run('git', ['add', '-A'], { cwd });
  await run(
    'git',
    [
      '-c', 'user.email=agent@toqar.dev',
      '-c', 'user.name=toqar-instrumentation-agent',
      'commit',
      '-m',
      'feat(analytics): TOQAR instrumentation per approved tracking plan',
    ],
    { cwd },
  );
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd });

  return {
    branch,
    commitSha: stdout.trim(),
    body: buildPrBody({ plan: args.plan, verificationCommands: args.verificationCommands }),
  };
}
