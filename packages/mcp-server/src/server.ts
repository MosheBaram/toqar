import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compileMetric, compileRunQuery, listMetrics, reconstructRun, type QueryExecutor } from '@toqar/analysis';
import { z } from 'zod';

/**
 * The agent-native surface (spec: mcp-server): customers' own agents
 * query their analytics over MCP. Read-only by construction — no tool
 * mutates anything; write access arrives, if ever, behind the autonomy
 * dial in a later change. Tenant scoping comes from construction: one
 * server instance per tenant token.
 */

export interface McpServerOptions {
  /** Semantic-layer executor (real ClickHouse in production). */
  executor: QueryExecutor;
  /** Registry-service base URL + tenant token for findings/registry. */
  apiUrl: string;
  token: string;
  /** The tenant every metric query is scoped to (issued with the token). */
  tenantId: string;
}

export function createToqarMcpServer(opts: McpServerOptions): McpServer {
  const server = new McpServer({ name: 'toqar', version: '0.1.0' });
  const headers = { authorization: `Bearer ${opts.token}` };

  async function serviceGet(path: string): Promise<unknown> {
    const res = await fetch(`${opts.apiUrl}${path}`, { headers });
    if (!res.ok) throw new Error(`registry service ${res.status} on ${path}`);
    return res.json();
  }

  const asText = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  });

  server.tool(
    'query_metric',
    `Compute a TOQAR metric over a time window. Every result carries the query id (q_…) that resolves to the exact SQL. Available metrics: ${listMetrics()
      .map((m) => m.name)
      .join(', ')}.`,
    {
      metric: z.string(),
      from: z.string().describe('ISO 8601 window start (inclusive)'),
      to: z.string().describe('ISO 8601 window end (exclusive)'),
      segmentBy: z.enum(['task_type', 'agent_version', 'agent_name']).optional(),
      pivot: z.string().optional().describe('ISO pivot for before/after metrics'),
    },
    async ({ metric, from, to, segmentBy, pivot }) => {
      const query = compileMetric(metric, {
        tenantId: opts.tenantId,
        from,
        to,
        ...(segmentBy ? { segmentBy } : {}),
        ...(pivot ? { pivot } : {}),
      });
      const rows = await opts.executor.execute(query);
      return asText({ metric, query_id: query.id, rows });
    },
  );

  server.tool(
    'get_run',
    'Drill into one agent run: ordered steps with tool/model/token/cost context, error and retry highlighting, sub-agents, human events, and outcome — answers "why did this run fail?". Carries the query id (q_…) of the row query.',
    { task_id: z.string(), run_id: z.string() },
    async ({ task_id, run_id }) => {
      const query = compileRunQuery({ tenantId: opts.tenantId, taskId: task_id, runId: run_id });
      const rows = await opts.executor.execute(query);
      const run = reconstructRun({ taskId: task_id, runId: run_id }, rows);
      return asText({ query_id: query.id, run });
    },
  );

  server.tool('list_findings', 'List the tenant’s published findings, newest first.', {}, async () =>
    asText(await serviceGet('/v1/findings')),
  );

  server.tool(
    'get_finding',
    'Fetch one finding with its full evidence chain and delivery history.',
    { finding_id: z.string() },
    async ({ finding_id }) => asText(await serviceGet(`/v1/findings/${finding_id}`)),
  );

  server.tool(
    'get_registry',
    'The tenant’s event registry: every event’s identity card (description, journey, owner metric, hypothesis, status).',
    {},
    async () => asText(await serviceGet('/v1/registry/events')),
  );

  server.tool(
    'list_experiments',
    'List the tenant’s experiments (hypothesis, target metric, status), newest first.',
    {},
    async () => asText(await serviceGet('/v1/experiments')),
  );

  server.tool(
    'get_verdict',
    'Fetch one experiment with its verdict: decision, effect estimate, confidence sequence, per-arm samples, guardrail outcomes, and query ids.',
    { experiment_id: z.string() },
    async ({ experiment_id }) => asText(await serviceGet(`/v1/experiments/${experiment_id}`)),
  );

  return server;
}
