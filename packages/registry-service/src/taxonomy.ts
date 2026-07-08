import {
  SCHEMA_VERSION,
  TOQAR_EVENT_NAMES,
  type RegistryEntry,
} from '@toqar/registry';

/**
 * Per-event defaults for the seeded taxonomy: description and the owner
 * metric each core event exists to serve (matching the public schema
 * spec's layer derivations in packages/registry/README.md).
 */
const CORE_EVENT_DEFAULTS: Record<
  (typeof TOQAR_EVENT_NAMES)[number],
  { description: string; owner_metric: string }
> = {
  task_started: {
    description: 'A task began. Emitted once per task, before the first run.',
    owner_metric: 'task_success_rate',
  },
  task_completed: {
    description: 'The task finished with a success claim (verified or self-reported).',
    owner_metric: 'task_success_rate',
  },
  task_failed: {
    description: 'The task ended in failure.',
    owner_metric: 'task_success_rate',
  },
  task_abandoned: {
    description: 'The task was walked away from without an outcome.',
    owner_metric: 'abandonment_rate',
  },
  step_executed: {
    description: 'One step inside a run: LLM call, tool call, retrieval, or other.',
    owner_metric: 'cost_per_completed_task',
  },
  handoff_to_human: {
    description: 'The agent paused and asked a human.',
    owner_metric: 'escalation_rate',
  },
  human_approved: {
    description: 'A human approved a handoff.',
    owner_metric: 'approval_friction',
  },
  human_edited: {
    description: "A human changed the agent's output.",
    owner_metric: 'human_edit_distance',
  },
  human_overrode: {
    description: "A human took over or discarded the agent's work entirely.",
    owner_metric: 'override_rate',
  },
  feedback_given: {
    description: 'An explicit satisfaction signal from a person.',
    owner_metric: 'complaint_rate',
  },
};

/** The registry every new tenant starts with: the ten TOQAR core events. */
export function defaultTaxonomy(): RegistryEntry[] {
  return TOQAR_EVENT_NAMES.map((event) => ({
    event,
    ...CORE_EVENT_DEFAULTS[event],
    journey: 'toqar_core',
    status: 'active' as const,
    since_version: SCHEMA_VERSION,
  }));
}
