import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFixtureExecutor } from '@toqar/analysis-agent';
import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createToqarMcpServer } from './server.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let client: Client;
let tenantId: string;

const executor = createFixtureExecutor({
  cost_per_completed_task: [{ value: 0.84 }],
  per_tool_failure_rate: [
    { tool_name: 'crm_lookup', value: 0.31 },
    { tool_name: 'email_send', value: 0.02 },
  ],
  task_success_rate: [{ value: 0.62, ended_tasks: 672 }],
  run_events: [
    { event: 'task_started', timestamp: '2026-07-17T10:00:00.000Z', agent_name: 'sdr-agent', tool_name: '', model: '', status: '', latency_ms: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, retry_of_step_id: '', session_id: '', task_type: 'reply_to_lead' },
    { event: 'step_executed', timestamp: '2026-07-17T10:00:01.000Z', agent_name: 'sdr-agent', tool_name: 'crm_lookup', model: 'claude-opus-4-8', status: 'error', latency_ms: 900, tokens_in: 400, tokens_out: 80, cost_usd: 0.1, retry_of_step_id: '', session_id: '', task_type: 'reply_to_lead' },
    { event: 'task_failed', timestamp: '2026-07-17T10:00:02.000Z', agent_name: 'sdr-agent', tool_name: '', model: '', status: '', latency_ms: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, retry_of_step_id: '', session_id: '', task_type: 'reply_to_lead' },
  ],
});

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  const created = await store.createTenant('MCP Tenant');
  const token = created.token;
  tenantId = created.tenantId;
  await store.publishFinding(
    tenantId,
    {
      layer: 'O',
      severity: 'warning',
      variant: 'anomaly',
      headline: 'Cost per completed task is at $0.84.',
      summary: 'Retried crm_lookup steps are paid for.',
      metrics: [{ label: 'cost_per_completed_task', value: '$0.84', query_id: 'q_4444444444444444' }],
      evidence: [{ title: 'CPCT over the window', query_id: 'q_4444444444444444' }],
    },
    'test',
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');

  const server = createToqarMcpServer({
    executor,
    apiUrl: `http://127.0.0.1:${address.port}`,
    token,
    tenantId,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  await app.close();
  await db.close();
});

function textOf(result: unknown): string {
  return ((result as { content: { text: string }[] }).content[0] ?? { text: '' }).text;
}

describe('toqar MCP server', () => {
  it('exposes a read-only tool surface', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'get_finding',
      'get_registry',
      'get_run',
      'get_verdict',
      'list_experiments',
      'list_findings',
      'query_metric',
    ]);
  });

  it('query_metric returns the value with its citation (the q_ contract)', async () => {
    const result = await client.callTool({
      name: 'query_metric',
      arguments: { metric: 'task_success_rate', from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z' },
    });
    const body = JSON.parse(textOf(result));
    expect(body.rows[0].value).toBe(0.62);
    expect(body.query_id).toMatch(/^q_[0-9a-f]{16}$/);
    expect(body.metric).toBe('task_success_rate');
  });

  it('answers the logged cost question end-to-end over MCP', async () => {
    // "why did cost per task double on tuesday" — the client drives the
    // same metric calls the playbook would, through the protocol.
    const cpct = JSON.parse(
      textOf(
        await client.callTool({
          name: 'query_metric',
          arguments: { metric: 'cost_per_completed_task', from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z' },
        }),
      ),
    );
    const tools = JSON.parse(
      textOf(
        await client.callTool({
          name: 'query_metric',
          arguments: { metric: 'per_tool_failure_rate', from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z' },
        }),
      ),
    );
    expect(cpct.rows[0].value).toBe(0.84);
    expect(tools.rows[0].tool_name).toBe('crm_lookup');
    expect(cpct.query_id).not.toBe(tools.query_id);
  });

  it('lists and fetches findings with evidence chains', async () => {
    const list = JSON.parse(textOf(await client.callTool({ name: 'list_findings', arguments: {} })));
    expect(list.findings).toHaveLength(1);
    const finding = JSON.parse(
      textOf(
        await client.callTool({
          name: 'get_finding',
          arguments: { finding_id: list.findings[0].finding_id },
        }),
      ),
    );
    expect(finding.evidence[0].query_id).toBe('q_4444444444444444');
  });

  it('serves the registry identity cards', async () => {
    const registry = JSON.parse(textOf(await client.callTool({ name: 'get_registry', arguments: {} })));
    expect(registry.entries).toHaveLength(10);
    expect(registry.entries[0].owner_metric.length).toBeGreaterThan(0);
  });

  it('rejects an unknown metric honestly', async () => {
    const result = await client.callTool({
      name: 'query_metric',
      arguments: { metric: 'vibes', from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z' },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(result)).toContain('unknown metric');
  });
});

describe('get_run (spec: trace-explorer)', () => {
  it('answers "why did this run fail?" with ordered steps, error context, and a citation', async () => {
    const result = await client.callTool({
      name: 'get_run',
      arguments: { task_id: 'task_9', run_id: 'run_1' },
    });
    const body = JSON.parse((result.content as { text: string }[])[0]!.text);
    expect(body.query_id).toMatch(/^q_[0-9a-f]{16}$/);
    expect(body.run.outcome).toBe('failed');
    expect(body.run.steps[0]).toMatchObject({ tool_name: 'crm_lookup', status: 'error', latency_ms: 900 });
    expect(body.run.session_id).toBeNull(); // headless — never fabricated
    expect(body.run.totals.errors).toBe(1);
  });
});

