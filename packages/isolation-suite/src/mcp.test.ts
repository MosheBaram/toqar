import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFixtureExecutor } from '@toqar/analysis-agent';
import { createToqarMcpServer } from '@toqar/mcp-server';
import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** MCP surface registered in the adversarial suite (task 4.1). */

const db = await createPgliteExecutor();
const app = buildApp(db);
const store = new RegistryStore(db);
let attackerClient: Client;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const victim = await store.createTenant('MCP Victim');
  const attacker = await store.createTenant('MCP Attacker');

  await store.publishFinding(
    victim.tenantId,
    {
      layer: 'T',
      severity: 'info',
      variant: 'anomaly',
      headline: 'Victim finding with victim_secret_marker.',
      summary: 'Not for attacker eyes.',
      metrics: [{ label: 'task_success_rate', value: '70.0%', query_id: 'q_bbbbbbbbbbbbbbbb' }],
      evidence: [{ title: 'victim evidence', query_id: 'q_bbbbbbbbbbbbbbbb' }],
    },
    'suite',
  );

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');

  // The attacker runs their own tenant-scoped server instance — the only
  // shape that exists; scoping is by construction.
  const server = createToqarMcpServer({
    executor: createFixtureExecutor({}),
    apiUrl: `http://127.0.0.1:${address.port}`,
    token: attacker.token,
    tenantId: attacker.tenantId,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  attackerClient = new Client({ name: 'attacker', version: '0.0.0' });
  await attackerClient.connect(clientTransport);
});

afterAll(async () => {
  await attackerClient?.close();
  await app.close();
  await db.close();
});

describe('MCP surface isolation', () => {
  it("an attacker's MCP server never returns victim findings", async () => {
    const result = await attackerClient.callTool({ name: 'list_findings', arguments: {} });
    const text = JSON.stringify(result);
    expect(text).not.toContain('victim_secret_marker');
    const body = JSON.parse(
      (result as { content: { text: string }[] }).content[0]!.text,
    ) as { findings: unknown[] };
    expect(body.findings).toEqual([]);
  });

  it('the MCP tool surface remains read-only', async () => {
    const tools = await attackerClient.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      'get_finding',
      'get_registry',
      'list_findings',
      'query_metric',
    ]);
  });
});
