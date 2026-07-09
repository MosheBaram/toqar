import postgres from 'postgres';
import type { QueryResult, SqlExecutor, SqlRunner } from './executor.js';

/**
 * Production binding of the SQL seam over the `postgres` client.
 * Exercised by the documented smoke script against a real server
 * (see README) — CI runs the PGlite binding.
 */
export function createPostgresExecutor(connectionString: string): SqlExecutor {
  const sql = postgres(connectionString);

  const runner = (s: postgres.Sql | postgres.TransactionSql): SqlRunner => ({
    async query(text, params = []): Promise<QueryResult> {
      const rows = await s.unsafe(text, params as never[]);
      return { rows: rows as unknown as Record<string, unknown>[] };
    },
    async exec(text) {
      await s.unsafe(text);
    },
  });

  return {
    ...runner(sql),
    async transaction(fn) {
      return sql.begin(async (tx) => fn(runner(tx))) as Promise<never>;
    },
    async tenantTransaction(tenantId, fn) {
      return sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE toqar_app');
        await tx.unsafe("SELECT set_config('app.tenant', $1, true)", [tenantId]);
        return fn(runner(tx));
      }) as Promise<never>;
    },
    async close() {
      await sql.end();
    },
  };
}
