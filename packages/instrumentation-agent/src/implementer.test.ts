import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ModelSession } from './model.js';
import { implementPlan } from './implementer.js';
import { buildInstrumentationPlan } from './plan-builder.js';
import { scanRepo } from './scanner.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/agentic-app-demo');
const PASS = { command: 'node', args: ['-e', 'process.exit(0)'] };
const FAIL = { command: 'node', args: ['-e', 'process.exit(1)'] };

async function fixtureCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'toqar-impl-'));
  await cp(FIXTURE, dir, { recursive: true });
  return dir;
}

async function planFor(repoPath: string) {
  const scan = await scanRepo(repoPath, {
    repo: 'acme/sdr-agent',
    agentVersion: 'instrumentation-agent@0.1.0',
    now: () => '2026-07-09T14:00:00.000Z',
  });
  if (!scan.supported) throw new Error(scan.reason);
  const registry = [
    'task_started', 'task_completed', 'task_failed', 'task_abandoned',
    'step_executed', 'handoff_to_human', 'human_approved', 'human_overrode',
  ].map((event) => ({
    event,
    description: `${event} (seeded)`,
    journey: 'toqar_core',
    owner_metric: 'task_success_rate',
    status: 'active' as const,
    since_version: '0.1.0',
  }));
  return {
    seamMap: scan.seamMap,
    plan: buildInstrumentationPlan({ seamMap: scan.seamMap, registry, generatedAt: '2026-07-09T14:00:00.000Z' }),
  };
}

describe('implementPlan', () => {
  it('writes the wrapper, plan doc, and task_started wiring; host checks pass', async () => {
    const dir = await fixtureCopy();
    const { plan, seamMap } = await planFor(dir);

    const result = await implementPlan({
      repoPath: dir,
      plan,
      seamMap,
      hostChecks: [PASS],
    });

    expect(result.status).toBe('implemented');
    if (result.status !== 'implemented') return;
    expect(result.filesWritten).toEqual(
      expect.arrayContaining(['analytics/tracking-plan.md', 'src/analytics.ts']),
    );

    const wrapper = await readFile(join(dir, 'src/analytics.ts'), 'utf8');
    expect(wrapper).toContain('taskStarted');
    expect(wrapper).toContain('stepExecuted');
    expect(wrapper).not.toContain('feedbackGiven');
    expect(wrapper).toContain('ANALYTICS_DISABLED');

    const agent = await readFile(join(dir, 'src/agent.ts'), 'utf8');
    expect(agent).toContain("import { analytics } from './analytics.js'");
    expect(agent).toContain('analytics.taskStarted(');
    expect(agent).toContain("task_type: 'reply_to_lead'");
  });

  it('applies valid model-proposed edits and records invalid ones without applying', async () => {
    const dir = await fixtureCopy();
    const { plan, seamMap } = await planFor(dir);

    const session: ModelSession = {
      model: 'claude-sonnet-5',
      async send() {
        return {
          text: JSON.stringify([
            { file: 'src/crm.ts', afterLine: 2, insert: '// toqar: tool seams below emit step_executed via src/analytics.ts' },
            { file: '../outside.ts', afterLine: 0, insert: 'nope' },
            { file: 'src/missing.ts', afterLine: 1, insert: 'nope' },
          ]),
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      },
    };

    const result = await implementPlan({ repoPath: dir, plan, seamMap, hostChecks: [PASS], session });
    expect(result.status).toBe('implemented');
    if (result.status !== 'implemented') return;

    const crm = await readFile(join(dir, 'src/crm.ts'), 'utf8');
    expect(crm).toContain('tool seams below emit step_executed');
    expect(result.rejectedEdits).toHaveLength(2);
  });

  it('reports verification_failed when a host check is red', async () => {
    const dir = await fixtureCopy();
    const { plan, seamMap } = await planFor(dir);
    const result = await implementPlan({ repoPath: dir, plan, seamMap, hostChecks: [PASS, FAIL] });
    expect(result.status).toBe('verification_failed');
    if (result.status === 'verification_failed') {
      expect(result.failedCheck).toContain('node');
    }
  });
});
