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
  token = (await new RegistryStore(db).createTenant('Billing Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('billing account', () => {
  it('defaults to the starter tier with no provider refs', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/billing', headers: authed() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tier).toBe('starter');
    expect(body.customer_id).toBeNull();
  });

  it('stores provider references only — never card data', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/billing',
      headers: authed(),
      payload: { tier: 'growth', customer_id: 'cus_123', subscription_id: 'sub_456' },
    });
    expect(res.statusCode).toBe(200);

    const state = (await app.inject({ method: 'GET', url: '/v1/billing', headers: authed() })).json();
    expect(state.tier).toBe('growth');
    expect(state.customer_id).toBe('cus_123');
    expect(state.subscription_id).toBe('sub_456');
    // the payload shape only accepts provider refs; a card field is rejected
    const bad = await app.inject({
      method: 'PUT',
      url: '/v1/billing',
      headers: authed(),
      payload: { tier: 'growth', customer_id: 'cus_1', card_number: '4242424242424242' },
    });
    // extra fields ignored, but there is no column/field to store card data
    expect(bad.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/v1/billing', headers: authed() })).json();
    expect(JSON.stringify(after)).not.toContain('4242');
  });

  it('records and lists invoices by provider reference', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/invoices',
      headers: authed(),
      payload: { stripe_invoice_id: 'in_789', amount_usd: 200, period_start: '2026-07-01T00:00:00.000Z', period_end: '2026-08-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(200);
    const list = (await app.inject({ method: 'GET', url: '/v1/billing/invoices', headers: authed() })).json();
    expect(list.invoices).toHaveLength(1);
    expect(list.invoices[0].stripe_invoice_id).toBe('in_789');
  });

  it('rejects an invalid tier', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/billing',
      headers: authed(),
      payload: { tier: 'platinum', customer_id: 'cus_x' },
    });
    expect(res.statusCode).toBe(400);
  });
});
