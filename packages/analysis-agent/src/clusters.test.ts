import { validateFindingCitations } from '@toqar/registry';
import { describe, expect, it } from 'vitest';
import { clusterFailures, clusterFinding } from './clusters.js';

const rows = [
  { event: 'step_executed', task_type: 'reply_to_lead', tool_name: 'crm_lookup', status: 'timeout', task_id: 't1', run_id: 'r1' },
  { event: 'step_executed', task_type: 'reply_to_lead', tool_name: 'crm_lookup', status: 'timeout', task_id: 't2', run_id: 'r1' },
  { event: 'step_executed', task_type: 'reply_to_lead', tool_name: 'crm_lookup', status: 'error', task_id: 't3', run_id: 'r1' },
  { event: 'human_overrode', task_type: 'qualify_inbound', tool_name: '', status: '', task_id: 't4', run_id: 'r1' },
  { event: 'step_executed', task_type: 'reply_to_lead', tool_name: 'mail', status: 'ok', task_id: 't5', run_id: 'r1' }, // healthy — not clustered
];

describe('clusterFailures (spec: failure-clustering)', () => {
  it('surfaces unknown failure modes with computed, enumerable membership', () => {
    const clusters = clusterFailures(rows);
    expect(clusters).toHaveLength(3);
    const timeout = clusters[0]!; // largest first
    expect(timeout.label).toBe('crm_lookup timeout on reply_to_lead');
    expect(timeout.member_count).toBe(2);
    // The count IS the members — verifiable, not modeled.
    expect(timeout.members).toEqual([
      { task_id: 't1', run_id: 'r1' },
      { task_id: 't2', run_id: 'r1' },
    ]);
    expect(clusters.map((c) => c.signature.kind)).toContain('human_override');
  });

  it('is deterministic: same rows, same cluster ids', () => {
    expect(clusterFailures(rows)).toEqual(clusterFailures(rows));
  });
});

describe('clusterFinding', () => {
  it('a significant cluster passes the citation gate', () => {
    const cluster = clusterFailures(rows)[0]!;
    const finding = clusterFinding(cluster, 'q_aaaaaaaaaaaaaaaa');
    const citations = validateFindingCitations(finding);
    expect(citations.ok).toBe(true);
  });

  it('an uncited member count is rejected by the gate', () => {
    const cluster = clusterFailures(rows)[0]!;
    const finding = clusterFinding(cluster, 'q_aaaaaaaaaaaaaaaa') as { metrics: { query_id?: string }[] };
    delete finding.metrics[0]!.query_id;
    const citations = validateFindingCitations(finding);
    expect(citations.ok).toBe(false);
  });
});
