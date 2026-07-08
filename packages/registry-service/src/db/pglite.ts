import { PGlite } from '@electric-sql/pglite';
import type { QueryResult, SqlExecutor, SqlRunner } from './executor.js';

/**
 * Test binding of the SQL seam: in-process WASM Postgres. Dev dependency —
 * production code paths never import this module (see postgres.ts).
 */
export async function createPgliteExecutor(): Promise<SqlExecutor> {
  const db = new PGlite();
  await db.waitReady;

  const runner = (target: {
    query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (t: string) => Promise<unknown>;
  }): SqlRunner => ({
    async query(text, params = []): Promise<QueryResult> {
      const result = await target.query(text, params);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    async exec(text) {
      await target.exec(text);
    },
  });

  return {
    ...runner(db),
    async transaction(fn) {
      return db.transaction(async (tx) => fn(runner(tx)));
    },
    async close() {
      await db.close();
    },
  };
}
