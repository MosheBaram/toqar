import { createHash } from 'node:crypto';
import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { chMigrate } from './ch-migrate.js';
import type { EventRow } from './transform.js';

export function createClickHouse(url: string): ClickHouseClient {
  return createClient({ url });
}

/**
 * Ensures the ClickHouse schema by applying the versioned migrations
 * (spec: analytics-storage — see ch-migrate.ts for the schema itself).
 * ReplacingMergeTree keyed on (tenant_id, task_type, event, timestamp,
 * event_id) dedups redeliveries at merge time; exact reads use FINAL.
 */
export async function ensureSchema(ch: ClickHouseClient): Promise<void> {
  await chMigrate(ch);
}

export async function insertRows(ch: ClickHouseClient, rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Deterministic batch token: a retried identical batch carries the same
  // token and is skipped at insert (non_replicated_deduplication_window /
  // replicated window). The token hashes the FULL batch content — event_id
  // alone is not enough, because OTLP-derived event_ids are deterministic
  // per trace and tenant-independent, so two tenants exporting the same
  // trace would collide on an id-only token (caught by the integration
  // suite). Row-level ReplacingMergeTree stays the robust layer beneath.
  const token = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 32);
  await ch.insert({
    table: 'toqar.events',
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
      insert_deduplication_token: token,
      // A retried identical batch is skipped on the events table AND on
      // dependent MV targets (daily_rollups) — insert-level idempotency
      // beneath the ReplacingMergeTree row convergence.
      insert_deduplicate: 1,
      deduplicate_blocks_in_dependent_materialized_views: 1,
    },
  });
}
