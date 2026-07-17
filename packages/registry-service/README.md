# @toqar/registry-service

The registry backend: tenant-scoped storage for TOQAR registry entries —
the shared contract every Toqar agent reads and writes through. Fastify +
Postgres. New tenants start with the ten TOQAR core events; every
mutation lands in an append-only audit log; tracking plans apply
atomically with an optimistic-concurrency fingerprint.

## Routes

All `/v1/*` routes require `Authorization: Bearer <tenant token>`. Routes
are scoped by the authenticated tenant — tenant ids never appear in URLs.

| Route | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | No auth. Truthful service + database status (503 when the database is down). |
| `/v1/registry/events` | GET | The tenant's registry: `{ fingerprint, entries }`. The fingerprint feeds `apply`. |
| `/v1/registry/events/:event` | GET | One entry, or 404. |
| `/v1/registry/events/:event` | PUT | Upsert one entry (body must validate against `registryEntrySchema` and match the route event). |
| `/v1/registry/apply` | POST | Apply a tracking plan: `{ plan, fingerprint }`. 400 on invalid plan, 409 on conflicts or stale fingerprint. `removed` deprecates — nothing is ever deleted. |
| `/v1/registry/audit` | GET | Append-only audit records, newest first. |

## Environment

| Variable | Used by | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | production entrypoint | Postgres connection string for `createPostgresExecutor`. |

Tests need no environment: they run on PGlite (in-process Postgres).

## Real-Postgres smoke check

CI exercises the PGlite binding; before pointing the service at a real
server, run the same suite against it once:

```bash
# in packages/registry-service — requires a scratch database
DATABASE_URL=postgres://localhost:5432/toqar_smoke node --input-type=module -e "
import { createPostgresExecutor, migrate, MIGRATIONS, RegistryStore } from './dist/index.js';
const db = createPostgresExecutor(process.env.DATABASE_URL);
await migrate(db, MIGRATIONS);
const store = new RegistryStore(db);
const t = await store.createTenant('smoke');
const entries = await store.listEntries(t.tenantId);
console.log('seeded entries:', entries.length === 10 ? 'ok (10)' : 'FAIL ' + entries.length);
await db.close();
"
```

Expected output: `seeded entries: ok (10)`. (Build first: `pnpm build`.)

## RLS on the served path (spec: tenancy)

Every tenant-scoped store method runs inside `tenantTransaction` — a
transaction under the non-owner `toqar_app` role with `app.tenant` bound
transaction-locally — so the row-level policies apply to the service's own
queries (proven by `served-path-rls.test.ts`: an unscoped query inside the
store's own transaction sees only that tenant's rows, writes are pinned by
WITH CHECK, and unset context matches nothing). Policies use the
once-per-statement initPlan form. Deliberate owner-run paths, each
inherently cross-tenant or pre-tenant: token resolution by hash, tenant
creation, the benchmarking cohort, and the operator plane.

Production posture: the service's login role needs `GRANT toqar_app TO
<login>` (to `SET LOCAL ROLE`); run migrations as the owner; with PgBouncer
use transaction pooling — tenant context is only ever set with
transaction-local `set_config`, so it cannot leak across pooled
connections. Use managed-Postgres PITR with restores actually exercised.
