import type { ClickHouseClient } from '@clickhouse/client';
import { describe, expect, it } from 'vitest';
import { chMigrate, CH_MIGRATIONS, type ChMigration } from './ch-migrate.js';

/**
 * The migration runner against a recording fake (the real schema is
 * exercised end-to-end in integration.test.ts against ClickHouse itself).
 */
function fakeClickHouse(alreadyApplied: string[]) {
  const commands: string[] = [];
  const inserted: string[] = [];
  const ch = {
    command: async ({ query }: { query: string }) => {
      commands.push(query);
    },
    query: async () => ({
      json: async () => alreadyApplied.map((id) => ({ id })),
    }),
    insert: async ({ values }: { values: { id: string }[] }) => {
      inserted.push(...values.map((v) => v.id));
    },
  };
  return { ch: ch as unknown as ClickHouseClient, commands, inserted };
}

const TWO: ChMigration[] = [
  { id: '001_a', statements: ['CREATE TABLE a'] },
  { id: '002_b', statements: ['CREATE TABLE b', 'ALTER TABLE b'] },
];

describe('chMigrate', () => {
  it('applies pending migrations in order and records each id', async () => {
    const { ch, commands, inserted } = fakeClickHouse([]);
    const ran = await chMigrate(ch, TWO);
    expect(ran).toEqual(['001_a', '002_b']);
    expect(inserted).toEqual(['001_a', '002_b']);
    const ddl = commands.filter((c) => !c.includes('schema_migrations') && !c.includes('DATABASE'));
    expect(ddl).toEqual(['CREATE TABLE a', 'CREATE TABLE b', 'ALTER TABLE b']);
  });

  it('skips already-applied migrations', async () => {
    const { ch, commands } = fakeClickHouse(['001_a']);
    const ran = await chMigrate(ch, TWO);
    expect(ran).toEqual(['002_b']);
    expect(commands.some((c) => c === 'CREATE TABLE a')).toBe(false);
  });

  it('the real migration list is append-only and starts with events v2', () => {
    expect(CH_MIGRATIONS[0]!.id).toBe('001_events_v2');
    const ddl = CH_MIGRATIONS[0]!.statements.join('\n');
    // Query-aligned sort key: tenant leads, event_id LAST (dedup identity
    // without leading the index on a random UUID).
    expect(ddl).toContain('ORDER BY (tenant_id, task_type, event, timestamp, event_id)');
    expect(ddl).toContain('PARTITION BY toYYYYMM(timestamp)');
    expect(ddl).toContain('ReplacingMergeTree');
    // Typed hot columns present with codecs.
    for (const col of ['tokens_in', 'tokens_out', 'latency_ms', 'cost_usd', 'tool_name', 'verification', 'session_id']) {
      expect(ddl).toContain(col);
    }
    expect(ddl).toContain('CODEC(ZSTD(1))');
  });
});
