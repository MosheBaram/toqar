import { createHash } from 'node:crypto';

/**
 * The semantic layer (spec: semantic-layer): every TOQAR headline metric
 * compiled from a typed definition to parameterized ClickHouse SQL. The
 * math lives here and in SQL — never in an LLM. Every result carries the
 * exact query identity (`q_…`) the product cites everywhere.
 *
 * Reads use FINAL: toqar.events is a ReplacingMergeTree deduped on
 * (tenant_id, event_id) at merge time (see @toqar/pipeline).
 */

export type Layer = 'T' | 'O' | 'Q' | 'A' | 'R';

/** Allow-listed segmentation dimensions — never raw strings into SQL. */
const SEGMENTS = ['task_type', 'agent_version', 'agent_name'] as const;
export type SegmentBy = (typeof SEGMENTS)[number];

export interface MetricArgs {
  tenantId: string;
  /** ISO 8601 window, inclusive start, exclusive end. */
  from: string;
  to: string;
  segmentBy?: SegmentBy;
  /** For before/after metrics (regression_delta, net_task_growth). */
  pivot?: string;
}

export interface MetricQuery {
  /** Content hash of sql+params — the citation surface (`↳ q_…`). */
  id: string;
  metric: string;
  layer: Layer;
  sql: string;
  params: Record<string, string>;
}

interface MetricDef {
  layer: Layer;
  /** Aggregate expressions (aliases allowed downstream in ClickHouse). */
  select: string;
  /** Additional WHERE fragment beyond tenant/time scoping. */
  where?: string;
  /** Wraps the scoped select in an outer query (per-task rollups). */
  outer?: (inner: string) => string;
  /** Set when the metric needs the pivot parameter. */
  needsPivot?: boolean;
  /** Honest caveats (e.g. proxies) surfaced to consumers. */
  note?: string;
}

const prop = (name: string) => `JSONExtractString(payload, '${name}')`;
const num = (name: string) => `JSONExtractFloat(payload, '${name}')`;

const END_EVENTS = "event IN ('task_completed', 'task_failed', 'task_abandoned')";
const HUMAN_TOUCH =
  "event IN ('handoff_to_human', 'human_approved', 'human_edited', 'human_overrode')";

export const METRICS: Record<string, MetricDef> = {
  /* ---------------- T — Task Success ---------------- */
  task_success_rate: {
    layer: 'T',
    where: END_EVENTS,
    select:
      "countIf(event = 'task_completed') / count() AS value, count() AS ended_tasks",
  },
  overclaim_rate: {
    layer: 'T',
    outer: (inner) =>
      `SELECT countIf(contested) / count() AS value, count() AS self_reported_tasks FROM (${inner} HAVING self_rep > 0)`,
    select: `task_id, maxIf(1, event = 'task_completed' AND ${prop('verification')} = 'self_reported') AS self_rep, max(event IN ('human_edited', 'human_overrode') OR (event = 'feedback_given' AND JSONExtractFloat(payload, 'rating', 'value') = 0)) AS contested GROUP_BY task_id`,
  },
  first_run_resolution: {
    layer: 'T',
    outer: (inner) =>
      `SELECT countIf(runs = 1 AND completed) / countIf(completed) AS value FROM (${inner} GROUP_BY_MARKER)`,
    select:
      "task_id, uniqExact(run_id) AS runs, max(event = 'task_completed') AS completed GROUP_BY task_id",
  },
  abandonment_rate: {
    layer: 'T',
    where: END_EVENTS,
    select: "countIf(event = 'task_abandoned') / count() AS value",
  },

  /* ---------------- O — Operational Efficiency ---------------- */
  cost_per_completed_task: {
    layer: 'O',
    select: `sum(JSONExtractFloat(payload, 'cost_usd')) / countIf(event = 'task_completed') AS value, sum(JSONExtractFloat(payload, 'cost_usd')) AS total_cost_usd`,
  },
  tokens_per_task: {
    layer: 'O',
    where: "event = 'step_executed'",
    select: `(sum(${num('tokens_in')}) + sum(${num('tokens_out')})) / uniqExact(task_id) AS value`,
  },
  steps_per_task: {
    layer: 'O',
    where: "event = 'step_executed'",
    select: 'count() / uniqExact(task_id) AS value',
  },
  latency_p95: {
    layer: 'O',
    where: "event = 'step_executed'",
    select: `quantile(0.95)(${num('latency_ms')}) AS value, quantile(0.5)(${num('latency_ms')}) AS p50`,
  },
  loop_retry_ratio: {
    layer: 'O',
    where: "event = 'step_executed'",
    select: `countIf(${prop('retry_of_step_id')} != '') / count() AS value`,
  },
  per_tool_failure_rate: {
    layer: 'O',
    where: `event = 'step_executed' AND ${prop('tool_name')} != ''`,
    select: `${prop('tool_name')} AS tool_name, countIf(${prop('status')} != 'ok') / count() AS value GROUP_BY tool_name`,
  },

  /* ---------------- Q — Quality & Drift ---------------- */
  human_edit_distance: {
    layer: 'Q',
    where: "event = 'human_edited'",
    select: `avg(JSONExtractFloat(payload, 'edit_magnitude', 'value')) AS value, count() AS edits`,
  },
  regression_delta: {
    layer: 'Q',
    needsPivot: true,
    where: END_EVENTS,
    select:
      "countIf(event = 'task_completed' AND timestamp >= {pivot:DateTime64(3)}) / greatest(countIf(timestamp >= {pivot:DateTime64(3)}), 1) - countIf(event = 'task_completed' AND timestamp < {pivot:DateTime64(3)}) / greatest(countIf(timestamp < {pivot:DateTime64(3)}), 1) AS value",
    note: 'TSR after pivot minus TSR before pivot — every agent.version/model change is an implicit experiment.',
  },
  complaint_rate: {
    layer: 'Q',
    select: `countIf(event = 'feedback_given' AND JSONExtractFloat(payload, 'rating', 'value') = 0) / greatest(countIf(event = 'task_completed'), 1) AS value`,
  },

  /* ---------------- A — Autonomy & Trust ---------------- */
  autonomy_rate: {
    layer: 'A',
    outer: (inner) =>
      `SELECT countIf(NOT touched) / count() AS value FROM (${inner} HAVING ended > 0)`,
    select: `task_id, max(${HUMAN_TOUCH}) AS touched, maxIf(1, ${END_EVENTS}) AS ended GROUP_BY task_id`,
    note: 'Zero-intervention tasks — the agent-PMF indicator.',
  },
  escalation_rate: {
    layer: 'A',
    select: `countIf(event = 'handoff_to_human') / greatest(uniqExact(task_id), 1) AS value`,
  },
  override_rate: {
    layer: 'A',
    select: `countIf(event = 'human_overrode') / greatest(uniqExact(task_id), 1) AS value`,
  },
  approval_friction: {
    layer: 'A',
    where: "event = 'human_approved'",
    select: `quantile(0.5)(${num('response_latency_ms')}) AS value, quantile(0.95)(${num('response_latency_ms')}) AS p95`,
  },

  /* ---------------- R — Retention & Expansion ---------------- */
  weekly_task_actors: {
    layer: 'R',
    where: "event = 'task_started' AND session_id != ''",
    select: 'toStartOfWeek(timestamp) AS week, uniqExact(session_id) AS value GROUP_BY week',
    note: 'Account proxy: session_id until account identity exists in the schema — stated, not hidden.',
  },
  task_depth_expansion: {
    layer: 'R',
    where: "event = 'task_started'",
    select: 'toStartOfWeek(timestamp) AS week, uniqExact(task_type) AS value GROUP_BY week',
  },
  delegation_share: {
    layer: 'R',
    where: "event = 'task_started'",
    select: `countIf(${prop('initiator')} IN ('agent', 'schedule')) / count() AS value`,
  },
  net_task_growth: {
    layer: 'R',
    needsPivot: true,
    where: "event = 'task_completed'",
    select:
      'countIf(timestamp >= {pivot:DateTime64(3)}) AS current, countIf(timestamp < {pivot:DateTime64(3)}) AS previous, (current - previous) / greatest(previous, 1) AS value',
    note: 'Pivot splits the window into previous/current periods.',
  },
};

export function listMetrics(): { name: string; layer: Layer; note?: string }[] {
  return Object.entries(METRICS).map(([name, def]) => ({
    name,
    layer: def.layer,
    ...(def.note ? { note: def.note } : {}),
  }));
}

export function compileMetric(name: string, args: MetricArgs): MetricQuery {
  const def = METRICS[name];
  if (!def) throw new Error(`unknown metric: ${name}`);
  // Structural tenant scoping (spec: tenancy): unscoped product queries
  // are unrepresentable — enforced at runtime for JS callers too.
  if (!args.tenantId) throw new Error('a tenant is required — unscoped queries are unrepresentable');
  if (args.segmentBy && !SEGMENTS.includes(args.segmentBy)) {
    throw new Error(`unknown segment dimension: ${String(args.segmentBy)}`);
  }
  if (def.needsPivot && !args.pivot) {
    throw new Error(`metric ${name} requires a pivot timestamp`);
  }

  // GROUP_BY markers keep grouping declarative inside definitions.
  const [selectPart, groupPart] = def.select.split(' GROUP_BY ');
  const segment = args.segmentBy;
  const selectCols = segment ? `${segment}, ${selectPart}` : selectPart;
  const groupCols = [segment, groupPart === 'task_id' ? 'task_id' : groupPart]
    .filter((g): g is string => Boolean(g))
    .join(', ');

  const where = [
    'tenant_id = {tenantId:String}',
    'timestamp >= {from:DateTime64(3)}',
    'timestamp < {to:DateTime64(3)}',
    ...(def.where ? [def.where] : []),
  ].join(' AND ');

  let sql = `SELECT ${selectCols} FROM toqar.events FINAL WHERE ${where}`;
  if (groupCols) sql += ` GROUP BY ${groupCols}`;
  if (def.outer) sql = def.outer(sql).replace(' GROUP_BY_MARKER', '');

  // ClickHouse DateTime64 params reject the ISO trailing Z — normalize to
  // its canonical form; the citation record carries what actually executed.
  const ts = (iso: string) => iso.replace('T', ' ').replace(/Z$/, '');
  const params: Record<string, string> = {
    tenantId: args.tenantId,
    from: ts(args.from),
    to: ts(args.to),
    ...(def.needsPivot && args.pivot ? { pivot: ts(args.pivot) } : {}),
  };

  const id = `q_${createHash('sha256').update(sql + JSON.stringify(params)).digest('hex').slice(0, 16)}`;
  return { id, metric: name, layer: def.layer, sql, params };
}

/** Execution seam (design D4): fixture rows in unit tests, real ClickHouse in integration. */
export interface QueryExecutor {
  execute(query: MetricQuery): Promise<Record<string, unknown>[]>;
}
