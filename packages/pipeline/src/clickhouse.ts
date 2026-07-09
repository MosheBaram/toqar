import { createClient, type ClickHouseClient } from '@clickhouse/client';
import type { EventRow } from './transform.js';

export function createClickHouse(url: string): ClickHouseClient {
  return createClient({ url });
}

/**
 * One wide events table (design D4). ReplacingMergeTree keyed on
 * (tenant_id, event_id) dedups redeliveries at merge time; exact reads
 * use FINAL — documented query guidance until 1.4's semantic layer
 * encodes it.
 */
export async function ensureSchema(ch: ClickHouseClient): Promise<void> {
  await ch.command({ query: 'CREATE DATABASE IF NOT EXISTS toqar' });
  await ch.command({
    query: `
      CREATE TABLE IF NOT EXISTS toqar.events (
        tenant_id     String,
        event         LowCardinality(String),
        event_id      UUID,
        timestamp     DateTime64(3, 'UTC'),
        task_id       String,
        run_id        String,
        task_type     LowCardinality(String),
        agent_name    LowCardinality(String),
        agent_version String,
        payload       String
      )
      ENGINE = ReplacingMergeTree
      PARTITION BY toDate(timestamp)
      ORDER BY (tenant_id, event_id)
    `,
  });
  // Citation records: every executed metric query, resolvable by q_ id.
  await ch.command({
    query: `
      CREATE TABLE IF NOT EXISTS toqar.executed_queries (
        query_id    String,
        metric      String,
        sql         String,
        params      String,
        executed_at DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      ORDER BY (query_id, executed_at)
    `,
  });
}

export async function insertRows(ch: ClickHouseClient, rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;
  await ch.insert({
    table: 'toqar.events',
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: { date_time_input_format: 'best_effort' },
  });
}
