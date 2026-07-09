import type {
  PlannedEvent,
  RegistryEntry,
  Seam,
  SeamMap,
  TrackingPlan,
} from '@toqar/registry';

/**
 * Deterministic plan builder: maps seam kinds to the TOQAR core events
 * they justify. An event with no real seam does not appear — the skill's
 * hard rule ("never invent data or emit placeholder events") as code.
 *
 * Core events already exist in the tenant registry (seeded), so the plan
 * expresses instrumentation as `modified` entries carrying emission
 * anchors; product-specific `added` events are the LLM refinement's job
 * and arrive with human review, never from this function.
 */

const EVENT_SEAM_SOURCES: Record<string, Seam['kind'][]> = {
  task_started: ['task_start'],
  task_completed: ['outcome'],
  task_failed: ['outcome'],
  task_abandoned: ['outcome'],
  step_executed: ['llm_call', 'tool_call', 'retrieval'],
  handoff_to_human: ['handoff'],
  human_approved: ['handoff'],
  human_overrode: ['handoff'],
  human_edited: ['handoff'],
};

const IMPLEMENTATION_NOTES: Record<string, string> = {
  task_started: 'Emit at the top of each task entry point; task_id from the domain id, run_id per invocation.',
  task_completed: 'Emit on the success outcome; verification=verified when a downstream ack exists, else self_reported.',
  task_failed: 'Emit on the failure outcome with a stable error.type.',
  task_abandoned: 'Emit when the task is walked away from (declined, timeout).',
  step_executed: 'Emit per LLM/tool step with latency, status, and token usage where available.',
  handoff_to_human: 'Emit when control passes to a human; blocking=true when the task waits.',
  human_approved: 'Emit on approval with response_latency_ms.',
  human_overrode: 'Emit when the human replaces or discards the agent output.',
  human_edited: 'Emit when the human edits the artifact; edit_magnitude when computable.',
};

export interface BuildPlanArgs {
  seamMap: SeamMap;
  registry: RegistryEntry[];
  generatedAt: string;
}

export function buildInstrumentationPlan(args: BuildPlanArgs): TrackingPlan {
  const { seamMap, registry, generatedAt } = args;
  const byEvent = new Map(registry.map((e) => [e.event, e]));

  const modified: PlannedEvent[] = [];
  for (const [event, kinds] of Object.entries(EVENT_SEAM_SOURCES)) {
    const entry = byEvent.get(event);
    if (!entry) continue;
    const locations = seamMap.seams
      .filter((s) => kinds.includes(s.kind))
      .map((s) => s.location);
    if (locations.length === 0) continue;
    modified.push({
      ...entry,
      code_locations: [...new Set(locations)],
      implementation_notes:
        IMPLEMENTATION_NOTES[event] ?? 'Emit at the anchored seams.',
    });
  }

  return {
    repo: seamMap.repo,
    generated_at: generatedAt,
    summary: `Instrument ${seamMap.repo}: ${modified.length} TOQAR core events anchored to ${seamMap.seams.length} seams across ${seamMap.task_taxonomy.length} task type(s) (${seamMap.task_taxonomy.join(', ') || 'none detected'}). Product-specific events are proposed separately with human review.`,
    added: [],
    modified,
    removed: [],
  };
}
