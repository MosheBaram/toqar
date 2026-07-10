/**
 * Flag-provider integration (spec: flags-integration). Variant assignment
 * goes through a provider seam over systems the customer already runs —
 * Toqar builds no flag store. An unsupported provider is refused, never
 * faked into silent assignments.
 */

export type Variant = 'control' | 'variant';

export interface Assignment {
  subject: string;
  variant: Variant;
}

export interface ExposureRecord {
  /** The task/run id the variant was shown to — joins to toqar.events. */
  subject: string;
  variant: Variant;
}

export interface FlagProvider {
  assign(flagKey: string, subject: string): Promise<Assignment>;
}

export class UnsupportedProviderError extends Error {
  constructor(provider: string) {
    super(
      `unsupported flag provider "${provider}" — configure PostHog or LaunchDarkly; the agent does not invent assignments`,
    );
    this.name = 'UnsupportedProviderError';
  }
}

export interface FlagConfig {
  provider: 'posthog' | 'launchdarkly';
  apiKey: string;
  /** PostHog host (defaults to app.posthog.com). */
  host?: string;
  /** LaunchDarkly evaluator injection (the LD SDK in production). */
  evaluate?: (flagKey: string, subject: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

function posthogAdapter(config: FlagConfig): FlagProvider {
  const host = config.host ?? 'https://app.posthog.com';
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async assign(flagKey, subject) {
      const res = await fetchImpl(`${host}/decide?v=3`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: config.apiKey, distinct_id: subject }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        featureFlags?: Record<string, string | boolean>;
      };
      const value = body.featureFlags?.[flagKey];
      const variant: Variant = value === 'variant' || value === true ? 'variant' : 'control';
      return { subject, variant };
    },
  };
}

function launchDarklyAdapter(config: FlagConfig): FlagProvider {
  const evaluate = config.evaluate;
  if (!evaluate) {
    throw new Error('launchdarkly adapter requires an `evaluate` function (the LD SDK)');
  }
  return {
    async assign(flagKey, subject) {
      const on = await evaluate(flagKey, subject);
      return { subject, variant: on ? 'variant' : 'control' };
    },
  };
}

export function createFlagProvider(config: FlagConfig): FlagProvider {
  switch (config.provider) {
    case 'posthog':
      return posthogAdapter(config);
    case 'launchdarkly':
      return launchDarklyAdapter(config);
    default:
      throw new UnsupportedProviderError(String(config.provider));
  }
}

/* ---------------- exposure → arm join ---------------- */

/**
 * Guardrail aggregates per arm. These MUST match the semantic layer's
 * definitions (@toqar/analysis) — they are the same event-derived math,
 * grouped by the exposure arm. Verified against real ClickHouse in the
 * integration suite. No new event types are introduced.
 */
const ARM_AGGREGATES: Record<string, string> = {
  task_success_rate:
    "countIf(event = 'task_completed') / countIf(event IN ('task_completed', 'task_failed', 'task_abandoned'))",
  cost_per_completed_task:
    "sum(JSONExtractFloat(payload, 'cost_usd')) / countIf(event = 'task_completed')",
  override_rate: "countIf(event = 'human_overrode') / greatest(uniqExact(task_id), 1)",
};

export interface PerArmArgs {
  tenantId: string;
  from: string;
  to: string;
}

/**
 * Parameterized ClickHouse SQL computing a guardrail metric per exposure
 * arm. Exposures are joined from a bound `{exposures}` table-parameter
 * (subject, arm) so metrics come from existing `toqar.events` with no new
 * event types. Tenant-scoped and FINAL-reading like every product query.
 */
export function perArmMetricSql(metric: string, _args: PerArmArgs): string {
  const agg = ARM_AGGREGATES[metric];
  if (!agg) {
    throw new Error(`metric ${metric} is not a supported experiment guardrail`);
  }
  // Exposures arrive as two parallel Array(String) params (subjects, arms)
  // — the ClickHouse client serializes those cleanly; nested tuple params
  // do not round-trip. Zipped and unnested in SQL.
  return `SELECT ex.arm AS arm, ${agg} AS value
FROM toqar.events AS e FINAL
INNER JOIN (
  SELECT tupleElement(z, 1) AS subject, tupleElement(z, 2) AS arm
  FROM (SELECT arrayJoin(arrayZip({subjects:Array(String)}, {arms:Array(String)})) AS z)
) AS ex ON e.task_id = ex.subject
WHERE e.tenant_id = {tenantId:String}
  AND e.timestamp >= {from:DateTime64(3)}
  AND e.timestamp < {to:DateTime64(3)}
GROUP BY ex.arm`;
}
