import type { PlannedEvent, RegistryEntry, TrackingPlan } from '@toqar/registry';

/**
 * Local file ↔ backend diff as a tracking plan: local-only events are
 * `added`, changed events `modified`, backend-active events absent from
 * the file `removed`. Deprecated backend events absent locally are left
 * alone — deprecation is history, not drift.
 */
export function computeDiff(args: {
  local: RegistryEntry[];
  remote: RegistryEntry[];
  repo: string;
  filePath: string;
  generatedAt: string;
}): TrackingPlan {
  const { local, remote, repo, filePath, generatedAt } = args;
  const remoteByEvent = new Map(remote.map((e) => [e.event, e]));
  const localByEvent = new Map(local.map((e) => [e.event, e]));

  // The declaration site is the registry file itself — the honest anchor
  // for registry-as-code entries (emission sites live in instrumentation).
  const planned = (entry: RegistryEntry): PlannedEvent => ({
    ...entry,
    code_locations: [filePath],
    implementation_notes: 'declared in the registry-as-code file',
  });

  const added = local.filter((e) => !remoteByEvent.has(e.event)).map(planned);
  const modified = local
    .filter((e) => {
      const current = remoteByEvent.get(e.event);
      return current !== undefined && JSON.stringify(current) !== JSON.stringify(e);
    })
    .map(planned);
  const removed = remote
    .filter((e) => e.status === 'active' && !localByEvent.has(e.event))
    .map((e) => ({ event: e.event, reason: 'absent from the registry-as-code file' }));

  const summary =
    added.length + modified.length + removed.length === 0
      ? 'No drift between the registry file and the backend.'
      : `Sync ${repo}: ${added.length} added, ${modified.length} modified, ${removed.length} removed.`;

  return {
    repo,
    generated_at: generatedAt,
    summary,
    added,
    modified,
    removed,
  };
}

export function isEmptyDiff(plan: TrackingPlan): boolean {
  return plan.added.length === 0 && plan.modified.length === 0 && plan.removed.length === 0;
}
