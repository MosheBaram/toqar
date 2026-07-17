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
  // Deterministic batch token: on Replicated tables this makes producer/
  // sink retries of the same batch free (block-level insert dedup); on
  // plain MergeTree it is inert. Row-level convergence via
  // ReplacingMergeTree stays the robust layer either way.
  const token = createHash('sha256')
    .update(rows.map((r) => r.event_id).join(','))
    .digest('hex')
    .slice(0, 32);
  await ch.insert({
    table: 'toqar.events',
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
      insert_deduplication_token: token,
    },
  });
}
