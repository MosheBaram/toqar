import Fastify, { type FastifyInstance } from 'fastify';
import type { SqlExecutor } from './db/executor.js';
import { ConflictError, RegistryStore, ValidationError } from './store.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

/** Audit actor for API-originated mutations until real identities (change 1.6). */
const API_ACTOR = 'api';

/**
 * The registry HTTP API (design D3). Routes are scoped by the
 * authenticated tenant — no tenant id ever appears in a URL, so a
 * cross-tenant request is unrepresentable rather than merely checked.
 */
export function buildApp(db: SqlExecutor): FastifyInstance {
  const app = Fastify();
  const store = new RegistryStore(db);

  app.decorateRequest('tenantId', '');

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ValidationError) {
      return reply.code(400).send({ error: 'validation_failed', issues: err.issues });
    }
    if (err instanceof ConflictError) {
      return reply.code(409).send({ error: 'conflict', message: err.message });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });

  app.get('/health', async (_req, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      return reply.code(503).send({ status: 'degraded', database: 'down' });
    }
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/v1/')) return;
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const resolved = token ? await store.resolveToken(token) : null;
    if (!resolved) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (resolved.scope !== 'api:full') {
      return reply.code(403).send({ error: 'insufficient_scope', required: 'api:full' });
    }
    req.tenantId = resolved.tenantId;
  });

  app.get('/v1/registry/events', async (req) => {
    const entries = await store.listEntries(req.tenantId);
    const fingerprint = await store.fingerprint(req.tenantId);
    return { fingerprint, entries };
  });

  app.get<{ Params: { event: string } }>('/v1/registry/events/:event', async (req, reply) => {
    const entry = await store.getEntry(req.tenantId, req.params.event);
    if (!entry) return reply.code(404).send({ error: 'not_found' });
    return entry;
  });

  app.put<{ Params: { event: string }; Body: Record<string, unknown> }>(
    '/v1/registry/events/:event',
    async (req) => {
      const body = req.body ?? {};
      if (body.event !== req.params.event) {
        throw new ValidationError(
          `body event ${String(body.event)} does not match route event ${req.params.event}`,
        );
      }
      return store.putEntry(req.tenantId, body, API_ACTOR);
    },
  );

  app.post<{ Body: { plan?: unknown; fingerprint?: unknown } }>(
    '/v1/registry/apply',
    async (req) => {
      const { plan, fingerprint } = req.body ?? {};
      if (typeof fingerprint !== 'string') {
        throw new ValidationError('missing fingerprint — fetch /v1/registry/events first');
      }
      return store.applyPlan(req.tenantId, plan, fingerprint, API_ACTOR);
    },
  );

  app.get('/v1/registry/audit', async (req) => {
    const records = await store.listAudit(req.tenantId);
    return { records };
  });

  app.put('/v1/registry/seam-map', async (req) => {
    return store.putSeamMap(req.tenantId, req.body, API_ACTOR);
  });

  app.get<{ Querystring: { repo?: string } }>('/v1/registry/seam-map', async (req, reply) => {
    const repo = req.query.repo;
    if (!repo) throw new ValidationError('missing repo query parameter');
    const map = await store.getSeamMap(req.tenantId, repo);
    if (!map) return reply.code(404).send({ error: 'not_found' });
    return map;
  });

  app.post('/v1/registry/instrument-runs', async (req) => {
    return store.recordInstrumentRun(req.tenantId, req.body, API_ACTOR);
  });

  app.patch<{ Params: { id: string }; Body: { outcome?: unknown } }>(
    '/v1/registry/instrument-runs/:id',
    async (req, reply) => {
      const found = await store.updateRunOutcome(
        req.tenantId,
        req.params.id,
        req.body?.outcome,
        API_ACTOR,
      );
      if (!found) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    },
  );

  app.get('/v1/registry/instrument-runs', async (req) => {
    return store.listInstrumentRuns(req.tenantId);
  });

  app.post('/v1/findings', async (req, reply) => {
    const result = await store.publishFinding(req.tenantId, req.body, API_ACTOR);
    if ('rejected' in result) {
      return reply.code(400).send({ error: 'uncited_numbers', uncited: result.uncited });
    }
    return result;
  });

  app.get('/v1/findings', async (req) => {
    return { findings: await store.listFindings(req.tenantId) };
  });

  app.get<{ Params: { id: string } }>('/v1/findings/:id', async (req, reply) => {
    const finding = await store.getFinding(req.tenantId, req.params.id);
    if (!finding) return reply.code(404).send({ error: 'not_found' });
    return finding;
  });

  app.post<{ Params: { id: string } }>('/v1/findings/:id/deliveries', async (req, reply) => {
    const found = await store.recordDelivery(req.tenantId, req.params.id, req.body);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.get('/v1/autonomy', async (req) => {
    return store.getAutonomy(req.tenantId);
  });

  app.put('/v1/autonomy', async (req) => {
    return store.grantAutonomy(req.tenantId, req.body, API_ACTOR);
  });

  app.post('/v1/tokens', async (req) => {
    return store.issueToken(req.tenantId, req.body, API_ACTOR);
  });

  app.get('/v1/tokens', async (req) => {
    return { tokens: await store.listTokens(req.tenantId) };
  });

  app.delete<{ Params: { id: string } }>('/v1/tokens/:id', async (req, reply) => {
    const found = await store.revokeToken(req.tenantId, req.params.id, API_ACTOR);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.get('/v1/finding-rejections', async (req) => {
    return { rejections: await store.listFindingRejections(req.tenantId) };
  });

  app.post('/v1/experiments', async (req) => {
    return store.createExperiment(req.tenantId, req.body, API_ACTOR);
  });

  app.get('/v1/experiments', async (req) => {
    return { experiments: await store.listExperiments(req.tenantId) };
  });

  app.get<{ Params: { id: string } }>('/v1/experiments/:id', async (req, reply) => {
    const experiment = await store.getExperiment(req.tenantId, req.params.id);
    if (!experiment) return reply.code(404).send({ error: 'not_found' });
    return experiment;
  });

  app.patch<{ Params: { id: string } }>('/v1/experiments/:id', async (req, reply) => {
    const found = await store.updateExperiment(req.tenantId, req.params.id, req.body, API_ACTOR);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/v1/experiments/:id/verdict', async (req, reply) => {
    const found = await store.writeVerdict(req.tenantId, req.params.id, req.body, API_ACTOR);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.get('/v1/onboarding', async (req) => {
    return store.getOnboarding(req.tenantId);
  });

  app.post('/v1/onboarding/milestone', async (req) => {
    await store.recordMilestone(req.tenantId, req.body);
    return { ok: true };
  });

  app.get('/v1/billing', async (req) => {
    return store.getBilling(req.tenantId);
  });

  app.put('/v1/billing', async (req) => {
    await store.setBilling(req.tenantId, req.body);
    return { ok: true };
  });

  app.get('/v1/billing/invoices', async (req) => {
    return { invoices: await store.listInvoices(req.tenantId) };
  });

  app.post('/v1/billing/invoices', async (req) => {
    await store.recordInvoice(req.tenantId, req.body);
    return { ok: true };
  });

  app.get('/v1/benchmark/optin', async (req) => {
    return store.getBenchmarkOptin(req.tenantId);
  });

  app.put('/v1/benchmark/optin', async (req) => {
    await store.setBenchmarkOptin(req.tenantId, req.body, API_ACTOR);
    return { ok: true };
  });

  return app;
}
