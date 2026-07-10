import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeOnboardingStep, fetchOnboarding } from './onboarding.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let base: string;
let token: string;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('Web Onboarding')).token;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('onboarding view state', () => {
  it('reads honest state from the real service (pending, not fabricated)', async () => {
    const state = await fetchOnboarding(base, token);
    expect(state.current_step).toBe('connect_repo');
    expect(state.time_to_first_finding_ms).toBeNull();
    expect(describeOnboardingStep(state.current_step)).toMatch(/connect/i);
  });

  it('maps every real step to a human label — no unknown steps', async () => {
    const steps = [
      'connect_repo',
      'awaiting_plan',
      'review_plan',
      'awaiting_data',
      'awaiting_first_finding',
      'active',
    ];
    for (const step of steps) {
      expect(describeOnboardingStep(step)).not.toContain('unknown');
    }
  });
});
