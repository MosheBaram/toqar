import Fastify, { type FastifyInstance } from 'fastify';
import {
  eventEnvelopeSchema,
  TOQAR_EVENT_NAMES,
  toqarEventSchema,
} from '@toqar/registry';
import { RegistryStore, type SqlExecutor } from '@toqar/registry-service';
import { z } from 'zod';
import { mapResourceSpans, type OtlpResourceSpans } from './otel.js';
import { BackpressureError, type BufferedSink } from './sink.js';

declare module 'fastify' {
  interface FastifyRequest {
    collectorTenantId: string;
    collectorRetentionDays: number;
  }
}

/** Product-specific events: full envelope + snake_case name; extra props allowed. */
const productEventSchema = eventEnvelopeSchema
  .extend({ event: z.string().regex(/^[a-z][a-z0-9_]*$/, 'event names are snake_case') })
  .passthrough();

const CORE_EVENTS = new Set<string>(TOQAR_EVENT_NAMES);

export interface Rejection {
  index: number;
  reasons: string[];
}

/** In-memory per-tenant rejection accounting — visible, never silent. */
class RejectionCounters {
  private counts = new Map<string, Map<string, number>>();

  record(tenantId: string, reasonClass: string): void {
    const byReason = this.counts.get(tenantId) ?? new Map<string, number>();
    byReason.set(reasonClass, (byReason.get(reasonClass) ?? 0) + 1);
    this.counts.set(tenantId, byReason);
  }

  for(tenantId: string): { total: number; by_reason: Record<string, number> } {
    const byReason = Object.fromEntries(this.counts.get(tenantId) ?? []);
    return {
      total: Object.values(byReason).reduce((a, b) => a + b, 0),
      by_reason: byReason,
    };
  }
}

export function buildCollectorApp(db: SqlExecutor, sink: BufferedSink): FastifyInstance {
  const app = Fastify();
  const store = new RegistryStore(db);
  const rejections = new RejectionCounters();

  app.decorateRequest('collectorTenantId', '');
  app.decorateRequest('collectorRetentionDays', 365);

  app.get('/health', async () => {
    const health = sink.health();
    return { status: health.broker === 'up' ? 'ok' : 'degraded', ...health };
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/v1/')) return;
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const tenantId = bearer ? await store.findTenantByToken(bearer) : null;
    if (!tenantId) return reply.code(401).send({ error: 'unauthorized' });
    req.collectorTenantId = tenantId;
    // Per-tenant analytics retention rides every enriched event into
    // ClickHouse, where the events TTL is timestamp + retention_days
    // (spec: analytics-storage).
    req.collectorRetentionDays = await store.getRetentionDays(tenantId);
  });

  app.post<{ Body: { events?: unknown[] } }>('/v1/events', async (req, reply) => {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    const accepted: Record<string, unknown>[] = [];
    const rejected: Rejection[] = [];

    events.forEach((value, index) => {
      const name =
        typeof value === 'object' && value !== null
          ? String((value as Record<string, unknown>).event ?? '')
          : '';
      const schema = CORE_EVENTS.has(name) ? toqarEventSchema : productEventSchema;
      const parsed = schema.safeParse(value);
      if (parsed.success) {
        accepted.push({
          ...(parsed.data as Record<string, unknown>),
          tenant_id: req.collectorTenantId,
          retention_days: req.collectorRetentionDays,
        });
        return;
      }
      const reasons = parsed.error.issues.map((i) => `${i.path.join('.') || 'event'}: ${i.message}`);
      const reasonClass = parsed.error.issues.some((i) => i.path[0] === 'event')
        ? 'invalid_event_name'
        : 'schema_validation';
      rejections.record(req.collectorTenantId, reasonClass);
      rejected.push({ index, reasons });
    });

    // BufferedSink rides short outages; when its buffer is full it throws
    // BEFORE anything here is acknowledged — 503, client retries, nothing
    // acked is ever dropped (spec: stream-pipeline).
    try {
      await sink.publish(accepted);
    } catch (err) {
      if (err instanceof BackpressureError) {
        return reply.code(503).send({ error: 'ingest_backpressure' });
      }
      throw err;
    }

    return reply.code(202).send({ accepted: accepted.length, rejected });
  });

  app.get('/v1/rejections', async (req) => rejections.for(req.collectorTenantId));

  // OTLP/HTTP JSON trace intake (spec: otel-traces) — vanilla OTel SDKs
  // export here with the tenant token; spans map via versioned conventions.
  app.post<{ Body: OtlpResourceSpans }>('/v1/traces', async (req, reply) => {
    const { events, unmapped } = mapResourceSpans(req.body ?? {});
    for (let i = 0; i < unmapped.length; i++) {
      rejections.record(req.collectorTenantId, 'unmapped_span');
    }
    const enriched = events.map((e) => ({
      ...e,
      tenant_id: req.collectorTenantId,
      retention_days: req.collectorRetentionDays,
    }));
    try {
      await sink.publish(enriched);
    } catch (err) {
      if (err instanceof BackpressureError) {
        return reply.code(503).send({ error: 'ingest_backpressure' });
      }
      throw err;
    }
    return reply.code(202).send({ accepted: enriched.length, unmapped: unmapped.length });
  });

  return app;
}
