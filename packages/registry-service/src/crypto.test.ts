import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteExecutor } from './db/pglite.js';
import { migrate } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { RegistryStore } from './store.js';
import { decryptPayload, encryptPayload, generateDek, kekFromEnv, unwrapDek, wrapDek } from './crypto.js';
import type { SqlExecutor } from './db/executor.js';

const seamMap = (marker: string) => ({
  repo: `acme/${marker}`,
  frameworks: ['express'],
  seams: [{ kind: 'task_start', location: `src/${marker}.ts:1` }],
  task_taxonomy: ['secret_task'],
  agent_version: 'a@1',
  produced_at: '2026-07-17T00:00:00.000Z',
});

describe('envelope encryption primitives', () => {
  it('wraps/unwraps DEKs and round-trips payloads', () => {
    const kek = randomBytes(32);
    const dek = generateDek();
    expect(unwrapDek(kek, wrapDek(kek, dek)).equals(dek)).toBe(true);
    const sealed = encryptPayload(dek, 'const secret = 42;');
    expect(sealed.startsWith('enc:v1:')).toBe(true);
    expect(sealed).not.toContain('secret');
    expect(decryptPayload(dek, sealed)).toBe('const secret = 42;');
  });

  it('a different DEK cannot decrypt (authenticated encryption)', () => {
    const sealed = encryptPayload(generateDek(), 'payload');
    expect(() => decryptPayload(generateDek(), sealed)).toThrow();
  });

  it('kekFromEnv validates shape', () => {
    expect(kekFromEnv(undefined)).toBeNull();
    expect(() => kekFromEnv(Buffer.from('short').toString('base64'))).toThrow(/32 bytes/);
    expect(kekFromEnv(randomBytes(32).toString('base64'))?.length).toBe(32);
  });
});

describe('per-tenant encryption + crypto-shredding (spec: data-governance)', () => {
  let db: SqlExecutor;
  let store: RegistryStore;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    store = new RegistryStore(db, { kek: randomBytes(32) });
    tenantA = (await store.createTenant('Acme')).tenantId;
    tenantB = (await store.createTenant('Globex')).tenantId;
    await store.putSeamMap(tenantA, seamMap('alpha'), 'test');
    await store.putSeamMap(tenantB, seamMap('beta'), 'test');
  });

  it('seam maps (source context) are ciphertext at rest and decrypt on read', async () => {
    // At rest: the raw row carries no plaintext source locations.
    const raw = await db.query('SELECT seam_map::text AS s FROM repo_context WHERE tenant_id = $1', [tenantA]);
    expect(String(raw.rows[0]!.s)).not.toContain('src/alpha.ts');
    expect(String(raw.rows[0]!.s)).toContain('enc:v1:');
    // On read: transparent decryption through the store.
    const map = await store.getSeamMap(tenantA, 'acme/alpha');
    expect(map?.seams[0]?.location).toBe('src/alpha.ts:1');
  });

  it('crypto-shredding one tenant makes only its data unreadable, and is audited', async () => {
    await store.cryptoShredTenant(tenantA, 'founder');
    expect(await store.getSeamMap(tenantA, 'acme/alpha')).toBeNull();
    // The other tenant is untouched.
    expect((await store.getSeamMap(tenantB, 'acme/beta'))?.seams[0]?.location).toBe('src/beta.ts:1');
    const audit = await store.listAudit(tenantA);
    expect(audit.some((a) => a.event === 'crypto_shred')).toBe(true);
  });

  it('without a KEK, encryption is off and behavior is unchanged (documented)', async () => {
    const plain = new RegistryStore(db, { kek: null });
    const t = (await plain.createTenant('NoKek')).tenantId;
    await plain.putSeamMap(t, seamMap('gamma'), 'test');
    expect((await plain.getSeamMap(t, 'acme/gamma'))?.seams[0]?.location).toBe('src/gamma.ts:1');
  });
});
