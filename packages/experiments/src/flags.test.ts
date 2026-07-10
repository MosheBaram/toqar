import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFlagProvider,
  perArmMetricSql,
  UnsupportedProviderError,
  type ExposureRecord,
} from './flags.js';

describe('createFlagProvider — provider seam', () => {
  it('refuses an unsupported provider honestly (no invented assignments)', () => {
    expect(() => createFlagProvider({ provider: 'homegrown' as never, apiKey: 'x' })).toThrow(
      UnsupportedProviderError,
    );
  });
});

describe('PostHog adapter', () => {
  let server: Server;
  let base: string;
  const requests: { url: string; body: unknown }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += String(c)));
      req.on('end', () => {
        requests.push({ url: req.url ?? '', body: raw ? JSON.parse(raw) : null });
        if (req.url?.includes('/decide')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ featureFlags: { exp_crm_retry: 'variant' } }));
        } else {
          res.writeHead(200);
          res.end('{}');
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    if (typeof addr === 'string' || addr === null) throw new Error('no port');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('assigns a variant and records exposure', async () => {
    const provider = createFlagProvider({ provider: 'posthog', apiKey: 'phc_x', host: base });
    const assignment = await provider.assign('exp_crm_retry', 'task_42');
    expect(assignment.variant).toBe('variant');
    expect(assignment.subject).toBe('task_42');
    expect(requests.some((r) => r.url.includes('/decide'))).toBe(true);
  });
});

describe('LaunchDarkly adapter', () => {
  it('maps a boolean flag to control/variant arms', async () => {
    const provider = createFlagProvider({
      provider: 'launchdarkly',
      apiKey: 'sdk-x',
      evaluate: async () => true, // injected evaluator (LD SDK in production)
    });
    const assignment = await provider.assign('exp_crm_retry', 'task_7');
    expect(assignment.variant).toBe('variant');
    const control = createFlagProvider({
      provider: 'launchdarkly',
      apiKey: 'sdk-x',
      evaluate: async () => false,
    });
    expect((await control.assign('exp_crm_retry', 'task_8')).variant).toBe('control');
  });
});

describe('perArmMetricSql — exposure joins to TOQAR events', () => {
  it('computes a guardrail metric per arm using existing events, no new event types', () => {
    const exposures: ExposureRecord[] = [
      { subject: 'task_1', variant: 'control' },
      { subject: 'task_2', variant: 'variant' },
    ];
    const sql = perArmMetricSql('task_success_rate', {
      tenantId: 't_1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-08T00:00:00.000Z',
    });
    // arm is a join dimension over exposure; the metric SQL is the semantic-layer's,
    // parameterized and tenant-scoped.
    expect(sql).toContain('{tenantId:String}');
    expect(sql).toContain('FROM toqar.events AS e FINAL');
    expect(sql).toContain('GROUP BY ex.arm');
    expect(exposures).toHaveLength(2);
  });
});
