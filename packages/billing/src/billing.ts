/**
 * Billing (spec: billing). Usage is metered from real system events — a
 * bill line reconciles to a tenant-scoped query, same citation discipline
 * as findings. Payments go through Stripe; Toqar stores only provider
 * references (customer_id, subscription_id) — never card data, so PCI
 * scope stays with the provider.
 */

export type UsageMetric = 'events_ingested' | 'tasks_tracked' | 'agent_runs';

export interface UsageWindow {
  tenantId: string;
  from: string;
  to: string;
}

const METER_AGG: Record<UsageMetric, string> = {
  events_ingested: 'count() AS value',
  tasks_tracked: 'uniqExact(task_id) AS value',
  // an agent run is a distinct (task_id, run_id) pair that executed steps
  agent_runs: "uniqExact((task_id, run_id)) AS value",
};

/** Parameterized ClickHouse SQL metering usage from real events. */
export function usageMeterSql(metric: UsageMetric, _window: UsageWindow): string {
  const agg = METER_AGG[metric];
  if (!agg) throw new Error(`unknown usage meter: ${metric}`);
  return `SELECT ${agg}
FROM toqar.events FINAL
WHERE tenant_id = {tenantId:String}
  AND timestamp >= {from:DateTime64(3)}
  AND timestamp < {to:DateTime64(3)}`;
}

/* ---------------- tiers ---------------- */

export interface Tier {
  name: string;
  price_usd_month: number;
  limits: Record<UsageMetric, number>;
}

/**
 * Tiers seeded from the validation willingness-to-pay evidence
 * (docs/validation/scorecard.md: WTP green ≥ $200/mo). Limits are
 * generous starting points, tuned against real usage once customers exist.
 */
export const TIERS: Tier[] = [
  {
    name: 'starter',
    price_usd_month: 200,
    limits: { events_ingested: 1_000_000, tasks_tracked: 50_000, agent_runs: 1_000 },
  },
  {
    name: 'growth',
    price_usd_month: 800,
    limits: { events_ingested: 10_000_000, tasks_tracked: 500_000, agent_runs: 10_000 },
  },
];

export type Usage = Record<UsageMetric, number>;

const METRICS: UsageMetric[] = ['events_ingested', 'tasks_tracked', 'agent_runs'];

function covers(tier: Tier, usage: Usage): boolean {
  return METRICS.every((m) => usage[m] <= tier.limits[m]);
}

/** The smallest tier whose limits cover the usage; the largest if none do. */
export function resolveTier(usage: Usage): Tier {
  const sorted = [...TIERS].sort((a, b) => a.price_usd_month - b.price_usd_month);
  return sorted.find((t) => covers(t, usage)) ?? sorted[sorted.length - 1]!;
}

export interface Plan {
  tier: string;
  price_usd_month: number;
  limits: Usage;
  usage: Usage;
  over_limit: boolean;
}

export function planFor(tierName: string, usage: Usage): Plan {
  const tier = TIERS.find((t) => t.name === tierName) ?? TIERS[0]!;
  return {
    tier: tier.name,
    price_usd_month: tier.price_usd_month,
    limits: tier.limits,
    usage,
    over_limit: !covers(tier, usage),
  };
}

/* ---------------- payment provider references ---------------- */

/**
 * The only payment identifiers Toqar stores. Card data lives with Stripe;
 * these are opaque references to the customer and subscription there.
 */
export interface StripeRefs {
  customer_id: string;
  subscription_id: string | null;
}
