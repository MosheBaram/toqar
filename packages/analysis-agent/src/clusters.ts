import { createHash } from 'node:crypto';

/**
 * Autonomous failure/topic clustering (spec: failure-clustering): unknown
 * failure modes surface without anyone asking. Grouping is deterministic —
 * signature-based over recorded failure facts — so every cluster's member
 * count is computed and its members are enumerable (run references), never
 * modeled. An LLM may later relabel clusters for narrative polish; the
 * membership math never moves to a model.
 */

export interface FailureRow {
  event: string;
  task_type: string;
  tool_name: string;
  status: string;
  task_id: string;
  run_id: string;
}

export interface FailureCluster {
  cluster_id: string;
  /** Deterministic label from the signature — what the pattern IS. */
  label: string;
  signature: { kind: 'tool_failure' | 'human_override'; tool_name?: string; status?: string; task_type: string };
  member_count: number;
  members: { task_id: string; run_id: string }[];
}

/** The rows this expects come from a cited query (compileFailureRowsQuery). */
export function clusterFailures(rows: FailureRow[]): FailureCluster[] {
  const clusters = new Map<string, FailureCluster>();

  for (const row of rows) {
    let signature: FailureCluster['signature'] | null = null;
    if (row.event === 'step_executed' && row.status && row.status !== 'ok' && row.tool_name) {
      signature = { kind: 'tool_failure', tool_name: row.tool_name, status: row.status, task_type: row.task_type };
    } else if (row.event === 'human_overrode') {
      signature = { kind: 'human_override', task_type: row.task_type };
    }
    if (!signature) continue;

    const key = JSON.stringify(signature);
    const existing = clusters.get(key);
    const member = { task_id: row.task_id, run_id: row.run_id };
    if (existing) {
      existing.member_count += 1;
      existing.members.push(member);
    } else {
      const label =
        signature.kind === 'tool_failure'
          ? `${signature.tool_name} ${signature.status} on ${signature.task_type}`
          : `human overrides on ${signature.task_type}`;
      clusters.set(key, {
        cluster_id: `fc_${createHash('sha256').update(key).digest('hex').slice(0, 12)}`,
        label,
        signature,
        member_count: 1,
        members: [member],
      });
    }
  }

  return [...clusters.values()].sort((a, b) => b.member_count - a.member_count);
}

/**
 * A significant cluster becomes a finding draft whose numeric claims carry
 * the source query's citation — it flows through the same
 * validateFindingCitations gate as every finding.
 */
export function clusterFinding(
  cluster: FailureCluster,
  queryId: string,
): Record<string, unknown> {
  return {
    layer: cluster.signature.kind === 'human_override' ? 'A' : 'O',
    severity: cluster.member_count >= 10 ? 'critical' : 'warning',
    variant: 'anomaly',
    headline: `Recurring pattern: ${cluster.label} across ${cluster.member_count} runs.`,
    summary:
      `Clustered from recorded failure facts (deterministic signature grouping; ` +
      `members enumerable by run). The label names the pattern, not a measurement.`,
    metrics: [{ label: 'member_runs', value: String(cluster.member_count), query_id: queryId }],
    evidence: [{ title: `Member runs for ${cluster.label}`, query_id: queryId }],
  };
}
