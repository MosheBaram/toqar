import { describe, expect, it } from 'vitest';
import { createFixtureExecutor } from './fixture-executor.js';
import {
  createWebhookSender,
  evaluateAnomalyAlert,
  evaluateEvalRegressionAlert,
  evaluateThresholdAlert,
} from './alerts.js';

const route = { channel: 'webhook' as const, url: 'https://hooks.example.com/x' };
const window = { tenantId: 't_1', from: '2026-07-10T00:00:00.000Z', to: '2026-07-17T00:00:00.000Z' };

describe('threshold alerts (spec: alerting)', () => {
  it('fires with the actual value and its citation', async () => {
    const alert = { id: 'al_1', name: 'override spike', kind: 'threshold' as const, config: { metric: 'override_rate', above: 0.2 }, route };
    const executor = createFixtureExecutor({ override_rate: [{ value: 0.31 }] });
    const result = await evaluateThresholdAlert(alert, executor, window);
    expect(result.fired).toBe(true);
    expect(result.value).toBe(0.31);
    expect(result.query_id).toMatch(/^q_[0-9a-f]{16}$/);
    expect(result.message).toContain('0.31');
    expect(result.message).toContain(result.query_id!);
  });

  it('a quiet window records no-data honestly, never "all clear"', async () => {
    const alert = { id: 'al_1', name: 'x', kind: 'threshold' as const, config: { metric: 'override_rate', above: 0.2 }, route };
    const executor = createFixtureExecutor({ override_rate: [] });
    const result = await evaluateThresholdAlert(alert, executor, window);
    expect(result.fired).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.message).toBe('no data in window');
  });
});

describe('anomaly alerts use the deterministic primitive', () => {
  it('fires only when the primitive flags the latest point', () => {
    const alert = { id: 'al_2', name: 'tsr excursion', kind: 'anomaly' as const, config: { z_threshold: 3 }, route };
    const flat = Array.from({ length: 12 }, (_, i) => ({ value: 0.6, query_id: `q_${String(i).padStart(16, '0')}` }));
    expect(evaluateAnomalyAlert(alert, flat).fired).toBe(false);
    const spiked = [...flat.slice(0, 11), { value: 0.1, query_id: 'q_ffffffffffffffff' }];
    const fired = evaluateAnomalyAlert(alert, spiked);
    expect(fired.fired).toBe(true);
    expect(fired.value).toBe(0.1);
    expect(fired.query_id).toBe('q_ffffffffffffffff');
  });
});

describe('eval-regression alerts', () => {
  it('fires on a mean drop, labels the signal as judged/directional', () => {
    const alert = { id: 'al_3', name: 'quality drop', kind: 'eval_regression' as const, config: { max_drop: 0.1, evaluator_id: 'groundedness' }, route };
    const fired = evaluateEvalRegressionAlert(alert, { current: [0.5, 0.55], previous: [0.8, 0.85] });
    expect(fired.fired).toBe(true);
    expect(fired.message).toContain('directional');
    const calm = evaluateEvalRegressionAlert(alert, { current: [0.8], previous: [0.82] });
    expect(calm.fired).toBe(false);
    expect(evaluateEvalRegressionAlert(alert, { current: [], previous: [0.8] }).message).toContain('insufficient');
  });
});

describe('delivery', () => {
  it('delivers via webhook and surfaces failures as thrown errors (recorded by the caller)', async () => {
    const calls: { url: string; body: string }[] = [];
    const sender = createWebhookSender((async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch);
    await sender.deliver(route, 'fired!');
    expect(calls[0]!.url).toBe(route.url);

    const failing = createWebhookSender((async () => ({ ok: false, status: 500 })) as unknown as typeof fetch);
    await expect(failing.deliver(route, 'x')).rejects.toThrow('500');
  });
});
