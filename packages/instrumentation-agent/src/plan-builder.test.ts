import { trackingPlanSchema, type RegistryEntry, type SeamMap } from '@toqar/registry';
import { describe, expect, it } from 'vitest';
import { buildInstrumentationPlan } from './plan-builder.js';

const seamMap: SeamMap = {
  repo: 'acme/sdr-agent',
  frameworks: ['anthropic-sdk'],
  seams: [
    { kind: 'task_start', location: 'src/agent.ts:12', note: 'export async function replyToLead' },
    { kind: 'tool_call', location: 'src/agent.ts:15', note: 'fetchLead' },
    { kind: 'llm_call', location: 'src/agent.ts:17' },
    { kind: 'outcome', location: 'src/agent.ts:30', note: "return 'failed'" },
    { kind: 'handoff', location: 'src/agent.ts:32', note: 'requestApproval' },
    { kind: 'outcome', location: 'src/agent.ts:33', note: "return 'abandoned'" },
    { kind: 'tool_call', location: 'src/agent.ts:35', note: 'sendEmail' },
    { kind: 'outcome', location: 'src/agent.ts:36', note: "return 'sent'" },
  ],
  task_taxonomy: ['reply_to_lead'],
  agent_version: 'instrumentation-agent@0.1.0',
  produced_at: '2026-07-09T12:00:00.000Z',
};

function coreEntry(event: string): RegistryEntry {
  return {
    event,
    description: `${event} (seeded)`,
    journey: 'toqar_core',
    owner_metric: 'task_success_rate',
    status: 'active',
    since_version: '0.1.0',
  };
}

const registry = [
  'task_started',
  'task_completed',
  'task_failed',
  'task_abandoned',
  'step_executed',
  'handoff_to_human',
  'human_approved',
  'human_overrode',
  'human_edited',
  'feedback_given',
].map(coreEntry);

describe('buildInstrumentationPlan', () => {
  const plan = buildInstrumentationPlan({
    seamMap,
    registry,
    generatedAt: '2026-07-09T12:30:00.000Z',
  });

  it('produces a valid tracking plan', () => {
    expect(trackingPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.repo).toBe('acme/sdr-agent');
  });

  it('anchors task lifecycle events to task_start and outcome seams', () => {
    const started = plan.modified.find((e) => e.event === 'task_started');
    expect(started?.code_locations).toContain('src/agent.ts:12');
    const completed = plan.modified.find((e) => e.event === 'task_completed');
    expect(completed?.code_locations).toEqual(expect.arrayContaining(['src/agent.ts:36']));
  });

  it('anchors step_executed to llm and tool seams', () => {
    const step = plan.modified.find((e) => e.event === 'step_executed');
    expect(step?.code_locations).toEqual(
      expect.arrayContaining(['src/agent.ts:15', 'src/agent.ts:17', 'src/agent.ts:35']),
    );
  });

  it('anchors handoff events to handoff seams', () => {
    const handoff = plan.modified.find((e) => e.event === 'handoff_to_human');
    expect(handoff?.code_locations).toContain('src/agent.ts:32');
  });

  it('omits events with no real seam — nothing is invented', () => {
    expect(plan.modified.some((e) => e.event === 'feedback_given')).toBe(false);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
  });

  it('preserves registry identity fields on modified entries', () => {
    const step = plan.modified.find((e) => e.event === 'step_executed');
    expect(step?.journey).toBe('toqar_core');
    expect(step?.status).toBe('active');
  });
});
