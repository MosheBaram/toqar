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
  {
    // RLS engagement hardening (change: data-plane-hardening, group 5;
    // spec: tenancy delta).
    //
    // - Policies move to the initPlan form: (SELECT current_setting(...))
    //   evaluates once per statement instead of once per row — the
    //   benchmarked difference is ~10ms vs ~11s at scale. The missing_ok
    //   form stays: unset context compares against NULL and matches
    //   nothing (fail closed).
    // - Sequence grants: 007 granted ALL SEQUENCES as of that migration;
    //   billing_invoices (010) was created after it, so toqar_app lacked
    //   usage on its identity sequence — surfaced the moment the served
    //   path actually ran as toqar_app.
    // - FORCE ROW LEVEL SECURITY is deliberately NOT applied: the service
    //   connects as the owner and drops to toqar_app per tenant
    //   transaction; the owner-run paths (token resolution by hash, tenant
    //   creation, the benchmarking cohort, the operator plane) are
    //   inherently cross-tenant and would be broken by FORCE. Engagement
    //   comes from routing every tenant-scoped store method through
    //   tenantTransaction — proven by the served-path RLS test.
    id: '014_rls_initplan',
    sql: `
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO toqar_app;

      DROP POLICY tenant_isolation_tenants ON tenants;
      CREATE POLICY tenant_isolation_tenants ON tenants
        USING (id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_registry_entries ON registry_entries;
      CREATE POLICY tenant_isolation_registry_entries ON registry_entries
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_audit_log ON audit_log;
      CREATE POLICY tenant_isolation_audit_log ON audit_log
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_repo_context ON repo_context;
      CREATE POLICY tenant_isolation_repo_context ON repo_context
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_instrument_runs ON instrument_runs;
      CREATE POLICY tenant_isolation_instrument_runs ON instrument_runs
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_findings ON findings;
      CREATE POLICY tenant_isolation_findings ON findings
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_finding_deliveries ON finding_deliveries;
      CREATE POLICY tenant_isolation_finding_deliveries ON finding_deliveries
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_finding_rejections ON finding_rejections;
      CREATE POLICY tenant_isolation_finding_rejections ON finding_rejections
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_autonomy_grants ON autonomy_grants;
      CREATE POLICY tenant_isolation_autonomy_grants ON autonomy_grants
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_tenant_tokens ON tenant_tokens;
      CREATE POLICY tenant_isolation_tenant_tokens ON tenant_tokens
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_experiments ON experiments;
      CREATE POLICY tenant_isolation_experiments ON experiments
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_experiment_verdicts ON experiment_verdicts;
      CREATE POLICY tenant_isolation_experiment_verdicts ON experiment_verdicts
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_onboarding_timeline ON onboarding_timeline;
      CREATE POLICY tenant_isolation_onboarding_timeline ON onboarding_timeline
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_billing_accounts ON billing_accounts;
      CREATE POLICY tenant_isolation_billing_accounts ON billing_accounts
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_billing_invoices ON billing_invoices;
      CREATE POLICY tenant_isolation_billing_invoices ON billing_invoices
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));

      DROP POLICY tenant_isolation_benchmark_optin ON benchmark_optin;
      CREATE POLICY tenant_isolation_benchmark_optin ON benchmark_optin
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));
    `,
  },
  {
    // Redaction-at-ingest control (spec: data-governance): redaction is the
    // default; retaining un-redacted content is an explicit, audited,
    // per-tenant opt-in.
    id: '015_redaction_optout',
    sql: `
      ALTER TABLE tenants ADD COLUMN redaction_optout boolean NOT NULL DEFAULT false;
    `,
  },
  {
    // Per-tenant envelope-encryption keys (spec: data-governance). The
    // wrapped DEK lives beside the data; nulling it is crypto-shredding —
    // that tenant's ciphertext becomes permanently unreadable, nobody else
    // affected. Tenant-scoped RLS like every tenant table.
    id: '016_tenant_keys',
    sql: `
      CREATE TABLE tenant_keys (
        tenant_id text PRIMARY KEY REFERENCES tenants(id),
        wrapped_dek text,
        created_at timestamptz NOT NULL DEFAULT now(),
        shredded_at timestamptz
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_keys TO toqar_app;
      ALTER TABLE tenant_keys ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_tenant_keys ON tenant_keys
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));
    `,
  },
  {
    // Erasure audit (spec: data-governance): every right-to-be-forgotten
    // request from request to completion. Owner-only (erasure is operator
    // work) and deliberately NOT foreign-keyed — the record must survive
    // the tenant it erases.
    id: '017_erasure_audit',
    sql: `
      CREATE TABLE erasure_audit (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL,
        scope text NOT NULL CHECK (scope IN ('tenant', 'end_user')),
        subject text,
        requested_by text NOT NULL,
        requested_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX erasure_audit_tenant_idx ON erasure_audit (tenant_id, id DESC);
    `,
  },
  {
    // Data residency (spec: data-governance): a deterministic tag on the
    // tenant record routes its analytics ingest/query to the regional
    // data-plane cluster. The control plane stays global with non-personal
    // metadata only.
    id: '018_residency',
    sql: `
      ALTER TABLE tenants ADD COLUMN residency text NOT NULL DEFAULT 'us'
        CHECK (residency IN ('us', 'eu'));
    `,
  },
  {
    // Eval framework storage (spec: eval-framework): append-only scores
    // carrying the full version tuple + evaluator identity; versioned
    // datasets of promoted production trajectories. Tenant-scoped RLS like
    // every tenant table; initPlan-form policies.
    id: '019_evals',
    sql: `
      CREATE TABLE eval_scores (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        task_id text NOT NULL,
        run_id text NOT NULL,
        evaluator_id text NOT NULL,
        evaluator_kind text NOT NULL CHECK (evaluator_kind IN ('code', 'judge', 'human')),
        rubric_hash text NOT NULL,
        judge_model text,
        prompt_version text NOT NULL,
        model_version text NOT NULL,
        agent_version text NOT NULL,
        dataset_version text,
        value double precision NOT NULL CHECK (value >= 0 AND value <= 1),
        label text,
        reasoning text,
        judge_latency_ms double precision,
        judge_tokens double precision,
        scored_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX eval_scores_tenant_idx ON eval_scores (tenant_id, task_id, run_id);

      CREATE TABLE eval_datasets (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        name text NOT NULL,
        version text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE eval_dataset_cases (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        dataset_id text NOT NULL REFERENCES eval_datasets(id),
        case_id text NOT NULL,
        trajectory jsonb NOT NULL,
        added_at timestamptz NOT NULL DEFAULT now()
      );

      GRANT SELECT, INSERT, UPDATE, DELETE ON eval_scores, eval_datasets, eval_dataset_cases TO toqar_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO toqar_app;

      ALTER TABLE eval_scores ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_eval_scores ON eval_scores
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));
      ALTER TABLE eval_datasets ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_eval_datasets ON eval_datasets
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));
      ALTER TABLE eval_dataset_cases ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_eval_dataset_cases ON eval_dataset_cases
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));
    `,
  },
  {
    // Alerting (spec: alerting): per-tenant alert configs and the recorded
    // lifecycle of every evaluation and delivery — fired or not, delivered
    // or failed, never silent.
    id: '020_alerts',
    sql: `
      CREATE TABLE alerts (
        id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('threshold', 'anomaly', 'eval_regression')),
        config jsonb NOT NULL,
        route jsonb NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE alert_events (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenants(id),
        alert_id text NOT NULL REFERENCES alerts(id),
        fired boolean NOT NULL,
        value double precision,
        query_id text,
        delivery_status text CHECK (delivery_status IN ('delivered', 'failed', 'skipped')),
        delivery_detail text,
        evaluated_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON alerts, alert_events TO toqar_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO toqar_app;
      ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_alerts ON alerts
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));
      ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_alert_events ON alert_events
        USING (tenant_id = (SELECT current_setting('app.tenant', true)))
        WITH CHECK (tenant_id = (SELECT current_setting('app.tenant', true)));
    `,
  },
];
