import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let token: string;
const authed = () => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('Onboarding Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('onboarding timeline', () => {
  it('starts empty with an honest pending state', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/onboarding', headers: authed() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connected_at).toBeNull();
    expect(body.first_finding_at).toBeNull();
    expect(body.time_to_first_finding_ms).toBeNull();
    expect(body.current_step).toBe('connect_repo');
  });

  it('records milestones and advances the step honestly', async () => {
    const milestones = ['connected', 'plan_proposed', 'plan_approved', 'first_event'];
    for (const milestone of milestones) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/onboarding/milestone',
        headers: authed(),
        payload: { milestone, at: `2026-07-10T1${milestones.indexOf(milestone)}:00:00.000Z` },
      });
      expect(res.statusCode).toBe(200);
    }
    const state = (await app.inject({ method: 'GET', url: '/v1/onboarding', headers: authed() })).json();
    expect(state.connected_at).toBe('2026-07-10T10:00:00.000Z');
    expect(state.first_event_at).toBe('2026-07-10T13:00:00.000Z');
    // no finding yet — pending, not fabricated as complete
    expect(state.first_finding_at).toBeNull();
    expect(state.current_step).toBe('awaiting_first_finding');
    expect(state.time_to_first_finding_ms).toBeNull();
  });

  it('computes time-to-first-finding once the finding arrives', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/onboarding/milestone',
      headers: authed(),
      payload: { milestone: 'first_finding', at: '2026-07-10T14:00:00.000Z' },
    });
    const state = (await app.inject({ method: 'GET', url: '/v1/onboarding', headers: authed() })).json();
    expect(state.first_finding_at).toBe('2026-07-10T14:00:00.000Z');
    expect(state.current_step).toBe('active');
    // connected 10:00 → first finding 14:00 = 4h
    expect(state.time_to_first_finding_ms).toBe(4 * 60 * 60 * 1000);
  });

  it('rejects an unknown milestone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/onboarding/milestone',
      headers: authed(),
      payload: { milestone: 'teleported', at: '2026-07-10T15:00:00.000Z' },
    });
    expect(res.statusCode).toBe(400);
  });
});
