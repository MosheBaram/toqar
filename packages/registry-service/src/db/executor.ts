/**
 * The SQL seam (design D1): the store is written against this interface.
 * Tests bind PGlite (in-process Postgres, no containers); production binds
 * the `postgres` client. Both speak real SQL — no mocked storage, ever.
 */
export interface QueryResult {
  rows: Record<string, unknown>[];
}

export interface SqlRunner {
  /** Single parameterized statement. */
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  /** Multi-statement DDL/DML without parameters (migrations). */
  exec(text: string): Promise<void>;
}

export interface SqlExecutor extends SqlRunner {
  /** Runs fn atomically; a thrown error rolls everything back. */
  transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
  /**
   * Runs fn atomically under the non-owner app role with the tenant
   * bound as the RLS session variable (design D1 of tenancy-and-security):
   * even an unscoped query inside fn can only see that tenant's rows.
   */
  tenantTransaction<T>(tenantId: string, fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
