import { afterAll, describe, expect, it } from 'vitest';
import { createPgliteExecutor } from './pglite.js';

const db = await createPgliteExecutor();

afterAll(async () => {
  await db.close();
});

describe('SqlExecutor (PGlite binding)', () => {
  it('runs a parameterized query', async () => {
    const { rows } = await db.query('SELECT $1::int + $2::int AS sum', [2, 3]);
    expect(rows).toEqual([{ sum: 5 }]);
  });

  it('executes multi-statement DDL', async () => {
    await db.exec(
      'CREATE TABLE seam_check (n int); INSERT INTO seam_check VALUES (1), (2);',
    );
    const { rows } = await db.query('SELECT count(*)::int AS c FROM seam_check');
    expect(rows).toEqual([{ c: 2 }]);
  });

  it('commits a transaction', async () => {
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO seam_check VALUES ($1)', [3]);
    });
    const { rows } = await db.query('SELECT count(*)::int AS c FROM seam_check');
    expect(rows).toEqual([{ c: 3 }]);
  });

  it('rolls a failed transaction back', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('INSERT INTO seam_check VALUES ($1)', [4]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { rows } = await db.query('SELECT count(*)::int AS c FROM seam_check');
    expect(rows).toEqual([{ c: 3 }]);
  });
});
