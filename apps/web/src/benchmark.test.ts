import { computeBenchmark } from '@toqar/analysis';
import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeBenchmark, fetchOptin, setOptin } from './benchmark.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let base: string;
let token: string;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('Web Benchmark')).token;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('benchmark view', () => {
  it('reads and toggles opt-in against the real service', async () => {
    expect((await fetchOptin(base, token)).opted_in).toBe(false);
    await setOptin(base, token, true);
    expect((await fetchOptin(base, token)).opted_in).toBe(true);
  });

  it('describes a suppressed cohort without any number', () => {
    const result = computeBenchmark(
      [0.5, 0.6, 0.7].map((v, i) => ({ tenantId: `t${i}`, value: v })),
      { k: 5 },
    );
    const text = describeBenchmark(result);
    expect(text).toMatch(/not enough|insufficient/i);
    expect(text).not.toMatch(/\d\.\d/); // no metric figure shown
  });

  it('describes the cohort and own position when available', () => {
    const result = computeBenchmark(
      [0.5, 0.55, 0.6, 0.62, 0.71].map((v, i) => ({ tenantId: `t${i}`, value: v })),
      { k: 5, ownValue: 0.62 },
    );
    const text = describeBenchmark(result);
    expect(text).toContain('cohort');
    expect(text).toMatch(/percentile/i);
    // never another tenant's identity
    expect(text).not.toContain('t0');
  });
});
