import type { Finding } from '@toqar/registry';
import type { QueryExecutor } from '@toqar/analysis';
import { fmt, PLAYBOOK_VERSION, runMetric, type Window } from './playbooks.js';

export interface SweepRecord {
  /** Every query id the sweep executed — what was checked, on the record. */
  checked: string[];
  published: number;
  no_findings: boolean;
  skipped?: 'no_new_data';
}

export interface SweepOptions {
  executor: QueryExecutor;
  publish: (finding: Finding) => Promise<{ finding_id: string }>;
  window: Window;
  /** |regression_delta| below this is noise, not a finding. */
  deltaThreshold?: number;
}

/**
 * The T-layer regression playbook (the roadmap's canonical example):
 * TSR → regression delta around the pivot → per-tool segmentation.
 * When nothing clears the threshold, the sweep records that honestly —
 * no finding is manufactured (spec: Sweeps-are-honest scenario).
 */
export async function runSweep(opts: SweepOptions): Promise<SweepRecord> {
  const { executor, window } = opts;
  const threshold = opts.deltaThreshold ?? 0.05;
  const checked: string[] = [];

  const tsr = await runMetric(executor, 'task_success_rate', window);
  checked.push(tsr.query.id);
  const ended = Number(tsr.rows[0]?.ended_tasks ?? 0);
  if (tsr.rows.length === 0 || ended === 0) {
    return { checked, published: 0, no_findings: true, skipped: 'no_new_data' };
  }

  const delta = await runMetric(executor, 'regression_delta', window);
  checked.push(delta.query.id);
  const deltaValue = Number(delta.rows[0]?.value ?? 0);
  if (Math.abs(deltaValue) < threshold) {
    return { checked, published: 0, no_findings: true };
  }

  const tools = await runMetric(executor, 'per_tool_failure_rate', window);
  checked.push(tools.query.id);
  const topTool = [...tools.rows].sort((a, b) => Number(b.value) - Number(a.value))[0];

  const tsrValue = fmt.pct(tsr.rows[0]?.value);
  const deltaPts = fmt.pts(deltaValue);
  const toolShare = topTool ? fmt.pct(topTool.value) : null;
  const toolName = topTool ? String(topTool.tool_name) : null;

  const finding: Finding = {
    layer: 'T',
    severity: deltaValue < 0 ? 'critical' : 'positive',
    variant: 'regression',
    headline: `Task success moved ${deltaPts} across the pivot — now at ${tsrValue}.`,
    summary:
      toolName && toolShare
        ? `The shift concentrates at ${toolName}, whose failure rate sits at ${toolShare}. Segmentation and the delta computation are attached with their queries.`
        : 'No single tool dominates the shift; the delta computation is attached with its query.',
    metrics: [
      { label: 'task_success_rate', value: tsrValue, query_id: tsr.query.id },
      { label: 'regression_delta', value: deltaPts, query_id: delta.query.id },
      ...(toolName && toolShare
        ? [{ label: `failure_rate:${toolName}`, value: toolShare, query_id: tools.query.id }]
        : []),
    ],
    evidence: [
      { title: 'Task success rate over the window', query_id: tsr.query.id },
      { title: 'Regression delta around the pivot', query_id: delta.query.id },
      { title: 'Per-tool failure segmentation', query_id: tools.query.id },
    ],
    prompt_version: PLAYBOOK_VERSION,
  };

  await opts.publish(finding);
  return { checked, published: 1, no_findings: false };
}
