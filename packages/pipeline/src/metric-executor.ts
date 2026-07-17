import type { ClickHouseClient } from '@clickhouse/client';
import type { MetricQuery, QueryExecutor } from '@toqar/analysis';

/**
 * Real-ClickHouse binding of the analysis QueryExecutor seam. Every
 * execution records (query_id, metric, sql, params, executed_at) in
 * toqar.executed_queries so `q_…` citations resolve later — the
 * reproducibility contract behind every number the product shows.
 */
export function createMetricExecutor(ch: ClickHouseClient): QueryExecutor {
  return {
    async execute(query: MetricQuery): Promise<Record<string, unknown>[]> {
      const result = await ch.query({
        query: query.sql,
        query_params: query.params,
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as Record<string, unknown>[];
      await ch.insert({
        table: 'toqar.executed_queries',
        values: [
          {
            query_id: query.id,
            metric: query.metric,
            sql: query.sql,
            params: JSON.stringify(query.params),
            executed_at: new Date().toISOString(),
          },
        ],
        format: 'JSONEachRow',
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          // The citation log writes on every metric read — server-side
          // async batching stops one-row-per-insert part churn while
          // wait_for_async_insert keeps the write durable (spec:
          // analytics-storage; a citation must survive its query).
          async_insert: 1,
          wait_for_async_insert: 1,
        },
      });
      return rows;
    },
  };
}
