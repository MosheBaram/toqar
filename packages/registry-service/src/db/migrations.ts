import type { Migration } from './migrate.js';

/** Ordered, append-only. Never edit an applied migration — add a new one. */
export const MIGRATIONS: Migration[] = [
  {
    id: '001_init',
    sql: `
      CREATE TABLE tenants (
        id text PRIMARY KEY,
        name text NOT NULL,
        token_hash text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE registry_entries (
        tenant_id text NOT NULL REFERENCES tenants(id),
        event text NOT NULL,
        entry jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, event)
      );

      CREATE TABLE audit_log (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        actor text NOT NULL,
        operation text NOT NULL,
        event text NOT NULL,
        diff jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX audit_log_tenant_idx ON audit_log (tenant_id, id DESC);
    `,
  },
];
