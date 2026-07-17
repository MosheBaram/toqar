import { createHash } from 'node:crypto';
import type { MetricQuery } from './semantic.js';

/**
 * Agent-native run reconstruction (spec: trace-explorer): one schema for
 * metrics and the explorer — a run is the ordered events of (task, run),
 * reconstructed from the same typed columns the metrics compute over.
 * Headless runs are first-class: no session means no session, never a
 * fabricated one.
 */

export interface RunStep {
  event: string;
  timestamp: string;
  agent_name: string;
  tool_name: string;
  model: string;
  status: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  retry_of_step_id: string;
}

export interface ReconstructedRun {
  task_id: string;
  run_id: string;
  task_type: string;
  /** Null for headless/background runs — first-class, not defaulted. */
  session_id: string | null;
  /** Root agent first, then sub-agents in order of first appearance. */
  agents: string[];
  outcome: 'completed' | 'failed' | 'abandoned' | 'in_flight';
  steps: RunStep[];
  human_events: { event: string; timestamp: string }[];
  totals: { steps: number; errors: number; retries: number; tokens: number; cost_usd: number };
  /** Structural match for @toqar/evals' Trajectory — one schema, no dep. */
  trajectory: {
    task_id: string;
    run_id: string;
    completed: boolean;
    steps: { event: string; tool_name?: string; status?: string; retry_of_step_id?: string }[];
  };
}

const HUMAN_EVENTS = new Set(['handoff_to_human', 'human_approved', 'human_edited', 'human_overrode']);
const END_EVENTS: Record<string, ReconstructedRun['outcome']> = {
  task_completed: 'completed',
  task_failed: 'failed',
  task_abandoned: 'abandoned',
};

/** Cited query for one run's ordered events — the drill-down's data source. */
export function compileRunQuery(args: { tenantId: string; taskId: string; runId: string }): MetricQuery {
  if (!args.tenantId) throw new Error('a tenant is required — unscoped queries are unrepresentable');
  const sql =
    'SELECT event, timestamp, agent_name, tool_name, model, status, latency_ms, tokens_in, tokens_out, cost_usd, retry_of_step_id, session_id, task_type ' +
    'FROM toqar.events FINAL WHERE tenant_id = {tenantId:String} AND task_id = {taskId:String} AND run_id = {runId:String} ' +
    'ORDER BY timestamp, event_id SETTINGS do_not_merge_across_partitions_select_final = 1';
  const params = { tenantId: args.tenantId, taskId: args.taskId, runId: args.runId };
  const id = `q_${createHash('sha256').update(sql + JSON.stringify(params)).digest('hex').slice(0, 16)}`;
  return { id, metric: 'run_events', layer: 'T', sql, params };
}

/**
 * Cited source rows for failure clustering (spec: failure-clustering):
 * step failures and human overrides in a window. The clusterer's member
 * counts reproduce from this query — the q_ id on a cluster finding
 * resolves here.
 */
export function compileFailureRowsQuery(args: { tenantId: string; from: string; to: string }): MetricQuery {
  if (!args.tenantId) throw new Error('a tenant is required — unscoped queries are unrepresentable');
  const sql =
    'SELECT event, task_type, tool_name, status, task_id, run_id ' +
    'FROM toqar.events FINAL WHERE tenant_id = {tenantId:String} ' +
    'AND timestamp >= {from:DateTime64(3)} AND timestamp < {to:DateTime64(3)} ' +
    "AND ((event = 'step_executed' AND status != 'ok' AND tool_name != '') OR event = 'human_overrode') " +
    'ORDER BY timestamp SETTINGS do_not_merge_across_partitions_select_final = 1';
  const ts = (iso: string) => iso.replace('T', ' ').replace(/Z$/, '');
  const params = { tenantId: args.tenantId, from: ts(args.from), to: ts(args.to) };
  const id = `q_${createHash('sha256').update(sql + JSON.stringify(params)).digest('hex').slice(0, 16)}`;
  return { id, metric: 'failure_rows', layer: 'O', sql, params };
}

/** Pure reconstruction over the query's rows — no fabricated fields. */
export function reconstructRun(
  args: { taskId: string; runId: string },
  rows: Record<string, unknown>[],
): ReconstructedRun {
  const str = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const steps: RunStep[] = rows
    .filter((r) => str(r.event) === 'step_executed')
    .map((r) => ({
      event: 'step_executed',
      timestamp: str(r.timestamp),
      agent_name: str(r.agent_name),
      tool_name: str(r.tool_name),
      model: str(r.model),
      status: str(r.status),
      latency_ms: num(r.latency_ms),
      tokens_in: num(r.tokens_in),
      tokens_out: num(r.tokens_out),
      cost_usd: num(r.cost_usd),
      retry_of_step_id: str(r.retry_of_step_id),
    }));

  const agents: string[] = [];
  for (const r of rows) {
    const a = str(r.agent_name);
    if (a && !agents.includes(a)) agents.push(a);
  }

  let outcome: ReconstructedRun['outcome'] = 'in_flight';
  for (const r of rows) {
    const mapped = END_EVENTS[str(r.event)];
    if (mapped) outcome = mapped;
  }

  const session = rows.map((r) => str(r.session_id)).find((s) => s !== '') ?? null;

  return {
    task_id: args.taskId,
    run_id: args.runId,
    task_type: str(rows[0]?.task_type),
    session_id: session,
    agents,
    outcome,
    steps,
    human_events: rows
      .filter((r) => HUMAN_EVENTS.has(str(r.event)))
      .map((r) => ({ event: str(r.event), timestamp: str(r.timestamp) })),
    totals: {
      steps: steps.length,
      errors: steps.filter((s) => s.status && s.status !== 'ok').length,
      retries: steps.filter((s) => s.retry_of_step_id !== '').length,
      tokens: steps.reduce((n, s) => n + s.tokens_in + s.tokens_out, 0),
      cost_usd: rows.reduce((n, r) => n + num(r.cost_usd), 0),
    },
    trajectory: {
      task_id: args.taskId,
      run_id: args.runId,
      completed: outcome === 'completed',
      steps: rows.map((r) => ({
        event: str(r.event),
        ...(str(r.tool_name) ? { tool_name: str(r.tool_name) } : {}),
        ...(str(r.status) ? { status: str(r.status) } : {}),
        ...(str(r.retry_of_step_id) ? { retry_of_step_id: str(r.retry_of_step_id) } : {}),
      })),
    },
  };
}
