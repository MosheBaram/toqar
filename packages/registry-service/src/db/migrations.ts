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
  {
    id: '002_repo_context',
    sql: `
      CREATE TABLE repo_context (
        tenant_id text NOT NULL REFERENCES tenants(id),
        repo text NOT NULL,
        seam_map jsonb NOT NULL,
        agent_version text NOT NULL,
        produced_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, repo)
      );
    `,
  },
  {
    id: '003_instrument_runs',
    sql: `
      CREATE TABLE instrument_runs (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        repo text NOT NULL,
        pr_url text,
        outcome text NOT NULL DEFAULT 'delivered',
        tokens_in integer NOT NULL DEFAULT 0,
        tokens_out integer NOT NULL DEFAULT 0,
        cost_usd double precision NOT NULL DEFAULT 0,
        model text,
        agent_version text NOT NULL,
        delivered_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX instrument_runs_tenant_idx
        ON instrument_runs (tenant_id, delivered_at DESC);
    `,
  },
  {
    id: '004_findings',
    sql: `
      CREATE TABLE findings (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        finding jsonb NOT NULL,
        published_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX findings_tenant_idx ON findings (tenant_id, published_at DESC);

      CREATE TABLE finding_deliveries (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        finding_id text NOT NULL REFERENCES findings(id),
        channel text NOT NULL,
        status text NOT NULL,
        detail text,
        attempted_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE finding_rejections (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        reason text NOT NULL,
        draft jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
];
