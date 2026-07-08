import { afterAll, describe, expect, it } from 'vitest';
import { migrate, type Migration } from './migrate.js';
import { createPgliteExecutor } from './pglite.js';

const db = await createPgliteExecutor();

afterAll(async () => {
  await db.close();
});

const MIGRATIONS: Migration[] = [
  {
    id: '001_widgets',
    sql: 'CREATE TABLE widgets (id text PRIMARY KEY, name text NOT NULL);',
  },
  {
    id: '002_widget_rows',
    sql: "INSERT INTO widgets (id, name) VALUES ('w1', 'first');",
  },
];

describe('migrate', () => {
  it('applies pending migrations in order and records them', async () => {
    const ran = await migrate(db, MIGRATIONS);
    expect(ran).toEqual(['001_widgets', '002_widget_rows']);
    const { rows } = await db.query('SELECT id FROM migrations ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(['001_widgets', '002_widget_rows']);
  });

  it('is idempotent — a second run applies nothing', async () => {
    const ran = await migrate(db, MIGRATIONS);
    expect(ran).toEqual([]);
    const { rows } = await db.query('SELECT count(*)::int AS c FROM widgets');
    expect(rows).toEqual([{ c: 1 }]);
  });

  it('applies only migrations not yet recorded', async () => {
    const extended: Migration[] = [
      ...MIGRATIONS,
      { id: '003_more', sql: "INSERT INTO widgets (id, name) VALUES ('w2', 'second');" },
    ];
    const ran = await migrate(db, extended);
    expect(ran).toEqual(['003_more']);
  });
});
