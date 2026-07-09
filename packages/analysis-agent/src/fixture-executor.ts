import type { MetricQuery, QueryExecutor } from '@toqar/analysis';

/**
 * Eval-harness executor: canned rows per metric, with a record of every
 * query the agent chose to run. It fakes the *database*, never the
 * agent's behavior — SQL arithmetic itself is verified against real
 * ClickHouse in the pipeline integration suite.
 */
export interface FixtureExecutor extends QueryExecutor {
  executed: MetricQuery[];
}

export function createFixtureExecutor(
  fixtures: Record<string, Record<string, unknown>[]>,
): FixtureExecutor {
  const executed: MetricQuery[] = [];
  return {
    executed,
    async execute(query) {
      executed.push(query);
      return fixtures[query.metric] ?? [];
    },
  };
}
