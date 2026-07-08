import type { SqlExecutor } from './executor.js';

export interface Migration {
  /** Stable ordered id, e.g. "001_init". Applied in array order. */
  id: string;
  /** Plain SQL, may contain multiple statements. */
  sql: string;
}

/**
 * Applies pending migrations in order, recording each in a `migrations`
 * table (design D2). Returns the ids applied this run; already-recorded
 * migrations are skipped, making the runner idempotent.
 */
export async function migrate(
  db: SqlExecutor,
  migrations: Migration[],
): Promise<string[]> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
       id text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     );`,
  );
  const { rows } = await db.query('SELECT id FROM migrations');
  const applied = new Set(rows.map((r) => r.id as string));

  const ran: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('INSERT INTO migrations (id) VALUES ($1)', [m.id]);
    });
    ran.push(m.id);
  }
  return ran;
}
