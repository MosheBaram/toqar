import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
const store = new RegistryStore(db);
let originalToken: string;
const authed = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  originalToken = (await store.createTenant('Token Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('token lifecycle (spec: tenancy + registry-backend delta)', () => {
  let eventsTokenId: string;
  let eventsToken: string;
  let fullToken: string;

  it('issues scoped tokens, returning the secret exactly once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tokens',
      headers: authed(originalToken),
      payload: { scope: 'events:write' },
    });
    expect(res.statusCode).toBe(200);
    eventsTokenId = res.json().token_id;
    eventsToken = res.json().token;
    expect(eventsToken).toMatch(/^tok_/);

    const full = await app.inject({
      method: 'POST',
      url: '/v1/tokens',
      headers: authed(originalToken),
      payload: { scope: 'api:full' },
    });
    fullToken = full.json().token;
  });

  it('lists tokens by prefix only — never full values or hashes', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/tokens', headers: authed(originalToken) });
    const tokens = res.json().tokens as { prefix: string; scope: string }[];
    expect(tokens.length).toBe(3); // migrated original + two issued
    for (const t of tokens) {
      expect(t.prefix.length).toBeLessThanOrEqual(12);
      expect(JSON.stringify(t)).not.toContain(eventsToken.slice(16));
    }
    expect(tokens.some((t) => t.scope === 'events:write')).toBe(true);
  });

  it('contains an events:write token: registry mutations 403', async () => {
    const read = await app.inject({
      method: 'GET',
      url: '/v1/registry/events',
      headers: authed(eventsToken),
    });
    expect(read.statusCode).toBe(403);

    const fullRead = await app.inject({
      method: 'GET',
      url: '/v1/registry/events',
      headers: authed(fullToken),
    });
    expect(fullRead.statusCode).toBe(200);
  });

  it('revocation is immediate and audited', async () => {
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/v1/tokens/${eventsTokenId}`,
      headers: authed(originalToken),
    });
    expect(revoke.statusCode).toBe(200);

    const resolved = await store.resolveToken(eventsToken);
    expect(resolved).toBeNull();

    const audit = await app.inject({
      method: 'GET',
      url: '/v1/registry/audit',
      headers: authed(originalToken),
    });
    const ops = (audit.json().records as { operation: string }[]).map((r) => r.operation);
    expect(ops.filter((o) => o === 'token').length).toBeGreaterThanOrEqual(3); // 2 issues + 1 revoke
  });

  it('rotation without downtime: new token works before and after old is revoked', async () => {
    const issued = await app.inject({
      method: 'POST',
      url: '/v1/tokens',
      headers: authed(originalToken),
      payload: { scope: 'api:full' },
    });
    const newToken = issued.json().token;

    expect(
      (await app.inject({ method: 'GET', url: '/v1/registry/events', headers: authed(newToken) })).statusCode,
    ).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/v1/tokens', headers: authed(newToken) });
    const migrated = (list.json().tokens as { token_id: string; prefix: string }[]).find((t) => t.prefix === originalToken.slice(0, 12));
    await app.inject({
      method: 'DELETE',
      url: `/v1/tokens/${migrated!.token_id}`,
      headers: authed(newToken),
    });

    expect(
      (await app.inject({ method: 'GET', url: '/v1/registry/events', headers: authed(originalToken) })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/registry/events', headers: authed(newToken) })).statusCode,
    ).toBe(200);
  });
});
