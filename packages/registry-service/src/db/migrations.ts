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
  {
    id: '005_autonomy_grants',
    sql: `
      CREATE TABLE autonomy_grants (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        level int NOT NULL CHECK (level IN (0, 1, 2)),
        granted_by text NOT NULL,
        granted_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: '006_tenant_tokens',
    sql: `
      CREATE TABLE tenant_tokens (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        token_hash text NOT NULL UNIQUE,
        prefix text NOT NULL,
        scope text NOT NULL CHECK (scope IN ('events:write', 'api:full')),
        issued_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      );

      INSERT INTO tenant_tokens (id, tenant_id, token_hash, prefix, scope)
        SELECT 'tk_' || id, id, token_hash, 'tok_migrated', 'api:full' FROM tenants;
    `,
  },
  {
    id: '007_rls',
    sql: `
      CREATE ROLE toqar_app NOLOGIN;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO toqar_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO toqar_app;

      ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_tenants ON tenants
        USING (id = current_setting('app.tenant', true))
        WITH CHECK (id = current_setting('app.tenant', true));

      ALTER TABLE registry_entries ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_registry_entries ON registry_entries
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_audit_log ON audit_log
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE repo_context ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_repo_context ON repo_context
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE instrument_runs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_instrument_runs ON instrument_runs
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_findings ON findings
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE finding_deliveries ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_finding_deliveries ON finding_deliveries
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE finding_rejections ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_finding_rejections ON finding_rejections
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE autonomy_grants ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_autonomy_grants ON autonomy_grants
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE tenant_tokens ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_tenant_tokens ON tenant_tokens
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));
    `,
  },
  {
    id: '008_experiments',
    sql: `
      CREATE TABLE experiments (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        experiment jsonb NOT NULL,
        status text NOT NULL DEFAULT 'created',
        variant_pr_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX experiments_tenant_idx ON experiments (tenant_id, created_at DESC);

      CREATE TABLE experiment_verdicts (
        experiment_id text PRIMARY KEY REFERENCES experiments(id),
        tenant_id text NOT NULL REFERENCES tenants(id),
        verdict jsonb NOT NULL,
        decided_at timestamptz NOT NULL DEFAULT now()
      );

      GRANT SELECT, INSERT, UPDATE, DELETE ON experiments, experiment_verdicts TO toqar_app;

      ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_experiments ON experiments
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));

      ALTER TABLE experiment_verdicts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_experiment_verdicts ON experiment_verdicts
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));
    `,
  },
  {
    id: '009_onboarding',
    sql: `
      CREATE TABLE onboarding_timeline (
        tenant_id text PRIMARY KEY REFERENCES tenants(id),
        connected_at timestamptz,
        plan_proposed_at timestamptz,
        plan_approved_at timestamptz,
        first_event_at timestamptz,
        first_finding_at timestamptz
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_timeline TO toqar_app;
      ALTER TABLE onboarding_timeline ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_onboarding_timeline ON onboarding_timeline
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));
    `,
  },
  {
    id: '010_billing',
    sql: `
      CREATE TABLE billing_accounts (
        tenant_id text PRIMARY KEY REFERENCES tenants(id),
        tier text NOT NULL DEFAULT 'starter',
        customer_id text,
        subscription_id text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE billing_invoices (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        stripe_invoice_id text NOT NULL,
        amount_usd double precision NOT NULL,
        period_start timestamptz NOT NULL,
        period_end timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON billing_accounts, billing_invoices TO toqar_app;
      ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_billing_accounts ON billing_accounts
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));
      ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_billing_invoices ON billing_invoices
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));
    `,
  },
  {
    id: '011_benchmark_optin',
    sql: `
      CREATE TABLE benchmark_optin (
        tenant_id text PRIMARY KEY REFERENCES tenants(id),
        opted_in boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON benchmark_optin TO toqar_app;
      ALTER TABLE benchmark_optin ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_benchmark_optin ON benchmark_optin
        USING (tenant_id = current_setting('app.tenant', true))
        WITH CHECK (tenant_id = current_setting('app.tenant', true));
    `,
  },
  {
    // Operator plane (spec: operator-console; registry-backend delta). These
    // tables are the ONLY cross-tenant surface. They are deliberately NOT a
    // tenant scope: tenant tokens carry a tenant_id FK, an operator does not.
    // They are owner-only — never GRANTed to toqar_app and never RLS-enabled —
    // so the non-owner tenant/RLS path physically cannot read them. This is
    // strictly stronger than a scope flag on tenant_tokens.
    id: '012_operator',
    sql: `
      CREATE TABLE operator_tokens (
        id text PRIMARY KEY,
        operator text NOT NULL,
        token_hash text NOT NULL UNIQUE,
        prefix text NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      );

      CREATE TABLE operator_audit (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        operator text NOT NULL,
        action text NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX operator_audit_idx ON operator_audit (id DESC);
    `,
  },
  {
    // Per-tenant analytics retention (spec: analytics-storage). The value
    // rides every enriched event into ClickHouse, where the events TTL is
    // timestamp + retention_days — no native per-tenant TTL exists, so the
    // window is a per-row column derived from this setting.
    id: '013_retention',
    sql: `
      ALTER TABLE tenants ADD COLUMN retention_days int NOT NULL DEFAULT 365
        CHECK (retention_days BETWEEN 1 AND 3650);
    `,
  },
];
