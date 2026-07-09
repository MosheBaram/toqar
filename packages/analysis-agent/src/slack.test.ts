import { createServer, type Server } from 'node:http';
import { validateFindingCitations, type Finding } from '@toqar/registry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFixtureExecutor } from './fixture-executor.js';
import { buildWeeklyDigest, deliverToSlack, renderFindingBlocks } from './slack.js';

const finding: Finding = {
  layer: 'T',
  severity: 'critical',
  variant: 'regression',
  headline: 'Task success moved -9.2 pts across the pivot — now at 62.0%.',
  summary: 'The shift concentrates at crm_lookup, whose failure rate sits at 84.0%.',
  metrics: [
    { label: 'task_success_rate', value: '62.0%', query_id: 'q_1111111111111111' },
    { label: 'regression_delta', value: '-9.2 pts', query_id: 'q_2222222222222222' },
    { label: 'failure_rate:crm_lookup', value: '84.0%', query_id: 'q_3333333333333333' },
  ],
  evidence: [{ title: 'TSR over the window', query_id: 'q_1111111111111111' }],
};

describe('renderFindingBlocks — Block Kit constraints (D2 SlackFinding)', () => {
  it('renders section, fields, ≤2 actions, and a mono context with query ids', () => {
    const blocks = renderFindingBlocks(finding, { findingUrl: 'https://app.toqar.dev/f/f_1' });
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(['section', 'section', 'actions', 'context']);

    const headline = blocks[0] as { text: { text: string } };
    expect(headline.text.text).toContain('*');
    expect(headline.text.text).toContain('62.0%');

    const fields = blocks[1] as { fields: { text: string }[] };
    expect(fields.fields.length).toBe(3);

    const actions = blocks[2] as { elements: unknown[] };
    expect(actions.elements.length).toBeLessThanOrEqual(2);

    const context = blocks[3] as { elements: { text: string }[] };
    expect(context.elements[0]!.text).toContain('q_1111111111111111');
  });
});

describe('deliverToSlack — fire-and-forget with a record', () => {
  let server: Server;
  let url: string;
  let respondWith = 200;
  const received: unknown[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += String(c)));
      req.on('end', () => {
        received.push(JSON.parse(raw));
        res.writeHead(respondWith);
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    if (typeof addr === 'string' || addr === null) throw new Error('no port');
    url = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('records a delivered attempt on 200', async () => {
    const records: { status: string; detail?: string }[] = [];
    await deliverToSlack(finding, {
      webhookUrl: url,
      record: async (status, detail) => {
        records.push({ status, ...(detail ? { detail } : {}) });
      },
    });
    expect(records).toEqual([{ status: 'delivered' }]);
    expect((received[0] as { blocks: unknown[] }).blocks.length).toBe(4);
  });

  it('records a failed attempt without throwing on 500', async () => {
    respondWith = 500;
    const records: { status: string; detail?: string }[] = [];
    await deliverToSlack(finding, {
      webhookUrl: url,
      record: async (status, detail) => {
        records.push({ status, ...(detail ? { detail } : {}) });
      },
    });
    expect(records[0]!.status).toBe('failed');
    expect(records[0]!.detail).toContain('500');
  });
});

describe('buildWeeklyDigest — the validation report, automated', () => {
  it('renders the TOQAR snapshot with every number cited', async () => {
    const executor = createFixtureExecutor({
      task_success_rate: [{ value: 0.62, ended_tasks: 672 }],
      cost_per_completed_task: [{ value: 0.42 }],
      autonomy_rate: [{ value: 0.55 }],
      override_rate: [{ value: 0.06 }],
      weekly_task_actors: [{ week: '2026-06-29', value: 41 }],
    });

    const digest = await buildWeeklyDigest({
      executor,
      window: {
        tenantId: 't_1',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-08T00:00:00.000Z',
        pivot: '2026-07-04T00:00:00.000Z',
      },
    });

    expect(digest.variant).toBe('digest');
    expect(digest.metrics).toHaveLength(5);
    expect(validateFindingCitations(digest)).toEqual({ ok: true });

    const blocks = renderFindingBlocks(digest, {});
    expect(blocks[0]?.type).toBe('section');
  });
});
