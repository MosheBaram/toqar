import type { ClickHouseClient } from '@clickhouse/client';

/**
 * ClickHouse schema migrations (spec: analytics-storage). Ordered and
 * append-only, mirroring the Postgres migration discipline in
 * @toqar/registry-service: never edit an applied migration — add a new one.
 * Applied ids are recorded in toqar.schema_migrations.
 */
export interface ChMigration {
  id: string;
  /** Statements run in order; each is one ClickHouse command. */
  statements: string[];
}

export const CH_MIGRATIONS: ChMigration[] = [
  {
    // Events v2 (change: data-plane-hardening, group 1).
    //
    // - Sort key leads with the real query predicates (tenant, task_type,
    //   event, time) instead of a random UUID; event_id stays LAST in the
    //   ORDER BY so ReplacingMergeTree still converges redeliveries
    //   (identical rows share the full key) without leading the index.
    // - The fields the semantic layer reads on the hot path are typed
    //   columns populated at transform time — no JSONExtract per read.
    //   `payload` keeps the full event for the long tail.
    // - Monthly partitions (daily × many tenants invites "too many parts").
    // - Per-column ZSTD codecs on non-key columns; LowCardinality for
    //   enum-like strings. Key columns keep default codecs.
    //
    // CREATE OR REPLACE: there is no production deployment (operator-gated);
    // pre-migration dev tables carry no data of record and are rebuilt.
    // From here on, schema changes are append-only ALTERs in new migrations.
    id: '001_events_v2',
    statements: [
      `CREATE OR REPLACE TABLE toqar.events (
        tenant_id           String,
        task_type           LowCardinality(String),
        event               LowCardinality(String),
        timestamp           DateTime64(3, 'UTC'),
        event_id            UUID,
        task_id             String CODEC(ZSTD(1)),
        run_id              String CODEC(ZSTD(1)),
        session_id          String DEFAULT '' CODEC(ZSTD(1)),
        agent_name          LowCardinality(String),
        agent_version       String CODEC(ZSTD(1)),
        tool_name           LowCardinality(String) DEFAULT '',
        model               LowCardinality(String) DEFAULT '',
        status              LowCardinality(String) DEFAULT '',
        verification        LowCardinality(String) DEFAULT '',
        initiator           LowCardinality(String) DEFAULT '',
        retry_of_step_id    String DEFAULT '' CODEC(ZSTD(1)),
        tokens_in           Float64 DEFAULT 0 CODEC(ZSTD(1)),
        tokens_out          Float64 DEFAULT 0 CODEC(ZSTD(1)),
        latency_ms          Float64 DEFAULT 0 CODEC(ZSTD(1)),
        cost_usd            Float64 DEFAULT 0 CODEC(ZSTD(1)),
        rating_value        Float64 DEFAULT 0 CODEC(ZSTD(1)),
        edit_magnitude_value Float64 DEFAULT 0 CODEC(ZSTD(1)),
        response_latency_ms Float64 DEFAULT 0 CODEC(ZSTD(1)),
        payload             String CODEC(ZSTD(1))
      )
      ENGINE = ReplacingMergeTree
      PARTITION BY toYYYYMM(timestamp)
      PRIMARY KEY (tenant_id, task_type, event, timestamp)
      ORDER BY (tenant_id, task_type, event, timestamp, event_id)`,
      // Citation records: every executed metric query, resolvable by q_ id.
      `CREATE TABLE IF NOT EXISTS toqar.executed_queries (
        query_id    String,
        metric      String,
        sql         String CODEC(ZSTD(1)),
        params      String CODEC(ZSTD(1)),
        executed_at DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      ORDER BY (query_id, executed_at)`,
    ],
  },
  {
    // Incremental rollups + insert idempotency (change: data-plane-hardening,
    // group 2; spec: analytics-storage).
    //
    // - Block-level insert dedup on the non-replicated table so a retried
    //   identical batch (same insert_deduplication_token) is skipped — on
    //   BOTH the events table and, via
    //   deduplicate_blocks_in_dependent_materialized_views at insert time,
    //   the rollup target. Row-level ReplacingMergeTree stays the robust
    //   convergence layer beneath.
    // - daily_rollups: SummingMergeTree of pure counters at
    //   (tenant_id, task_type, day) grain — TSR and CPCT read as sums.
    //   The MV's GROUP BY matches the target's ORDER BY (hard rule). A
    //   rollup is a cache of the raw events, never a second source of
    //   truth: the reconcile test asserts sums equal the raw-event metric.
    id: '002_daily_rollups',
    statements: [
      `ALTER TABLE toqar.events MODIFY SETTING non_replicated_deduplication_window = 1000`,
      `CREATE TABLE IF NOT EXISTS toqar.daily_rollups (
        tenant_id String,
        task_type LowCardinality(String),
        day       Date,
        completed UInt64,
        ended     UInt64,
        abandoned UInt64,
        cost_usd  Float64,
        events    UInt64
      )
      ENGINE = SummingMergeTree
      PARTITION BY toYYYYMM(day)
      ORDER BY (tenant_id, task_type, day)
      SETTINGS non_replicated_deduplication_window = 1000`,
      `CREATE MATERIALIZED VIEW IF NOT EXISTS toqar.daily_rollups_mv
      TO toqar.daily_rollups AS
      SELECT
        tenant_id,
        task_type,
        toDate(timestamp) AS day,
        countIf(event = 'task_completed') AS completed,
        countIf(event IN ('task_completed', 'task_failed', 'task_abandoned')) AS ended,
        countIf(event = 'task_abandoned') AS abandoned,
        sum(cost_usd) AS cost_usd,
        count() AS events
      FROM toqar.events
      GROUP BY tenant_id, task_type, day`,
    ],
  },
  {
    // Data lifecycle (change: data-plane-hardening, group 3; spec:
    // analytics-storage).
    //
    // - Per-tenant retention: no native per-tenant TTL exists, so the
    //   window is a per-row column (populated from the tenant's setting at
    //   collection time); TTL drops rows at timestamp + retention_days.
    //   ttl_only_drop_parts drops whole parts instead of rewriting rows.
    // - executed_queries (the citation log) gets its own retention, sized
    //   past the maximum event retention so a citation never outlives the
    //   data it cites the other way around.
    // - Tiered storage (hot disk → object storage via TTL ... TO VOLUME)
    //   is a server storage-policy, not DDL — documented in the pipeline
    //   README and applied at deployment (operator-gated).
    id: '003_retention_ttl',
    statements: [
      `ALTER TABLE toqar.events ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 365`,
      `ALTER TABLE toqar.events MODIFY TTL toDateTime(timestamp) + toIntervalDay(retention_days)`,
      `ALTER TABLE toqar.events MODIFY SETTING ttl_only_drop_parts = 1`,
      `ALTER TABLE toqar.executed_queries MODIFY TTL toDateTime(executed_at) + toIntervalDay(400)`,
    ],
  },
];

/**
 * Right-to-be-forgotten deletion (spec: analytics-storage): removes a
 * tenant's rows from the events table and the rollup cache. Lightweight
 * deletes make the rows immediately invisible to queries; physical removal
 * happens at merge. Never a per-row mutation storm — one statement per
 * table.
 */
/**
 * Per-end-user right-to-be-forgotten (spec: data-governance): session_id
 * is the end-user identity proxy in the schema (stated, not hidden — see
 * weekly_task_actors). Lightweight delete = immediately invisible to every
 * query; physical removal happens at merge (schedule purgeDeletedRows).
 */
export async function deleteEndUserEvents(
  ch: import('@clickhouse/client').ClickHouseClient,
  tenantId: string,
  sessionId: string,
): Promise<void> {
  if (!tenantId || !sessionId) throw new Error('tenantId and sessionId required');
  await ch.command({
    query: 'DELETE FROM toqar.events WHERE tenant_id = {tenantId:String} AND session_id = {sessionId:String}',
    query_params: { tenantId, sessionId },
  });
}

/**
 * Scheduled physical removal: forces merges so lightweight-deleted rows
 * leave disk. Heavy — run on the erasure schedule, not per request.
 */
export async function purgeDeletedRows(
  ch: import('@clickhouse/client').ClickHouseClient,
): Promise<void> {
  await ch.command({ query: 'OPTIMIZE TABLE toqar.events FINAL' });
  await ch.command({ query: 'OPTIMIZE TABLE toqar.daily_rollups FINAL' });
}

export async function deleteTenantEvents(
  ch: import('@clickhouse/client').ClickHouseClient,
  tenantId: string,
): Promise<void> {
  if (!tenantId) throw new Error('tenantId required');
  await ch.command({
    query: 'DELETE FROM toqar.events WHERE tenant_id = {tenantId:String}',
    query_params: { tenantId },
  });
  await ch.command({
    query: 'DELETE FROM toqar.daily_rollups WHERE tenant_id = {tenantId:String}',
    query_params: { tenantId },
  });
}

/** Applies pending migrations in order; already-applied ids are skipped. */
export async function chMigrate(
  ch: ClickHouseClient,
  migrations: ChMigration[] = CH_MIGRATIONS,
): Promise<string[]> {
  await ch.command({ query: 'CREATE DATABASE IF NOT EXISTS toqar' });
  await ch.command({
    query: `CREATE TABLE IF NOT EXISTS toqar.schema_migrations (
      id text, applied_at DateTime64(3, 'UTC') DEFAULT now64(3)
    ) ENGINE = MergeTree ORDER BY id`,
  });
  const result = await ch.query({
    query: 'SELECT id FROM toqar.schema_migrations',
    format: 'JSONEachRow',
  });
  const applied = new Set(((await result.json()) as { id: string }[]).map((r) => r.id));

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await ch.command({ query: statement });
    }
    await ch.insert({
      table: 'toqar.schema_migrations',
      values: [{ id: migration.id }],
      format: 'JSONEachRow',
    });
    ran.push(migration.id);
  }
  return ran;
}
