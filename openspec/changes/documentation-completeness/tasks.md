# Tasks — Documentation Completeness

> Additive docs + one CI drift check. No product code changes. Each group ships through branch → PR → CI → merge.

## 1. Package/app READMEs (spec: contributor-docs)

- [ ] 1.1 `packages/analysis-agent/README.md` — playbook-driven investigation agent; deps `@toqar/analysis`, `@toqar/registry`; how it's invoked and tested
- [ ] 1.2 `packages/cli/README.md` — deps `@toqar/registry`, `@toqar/instrumentation-agent`, `@toqar/registry-service`; commands and usage
- [ ] 1.3 `packages/collector/README.md` — Fastify HTTP + OTLP collector; deps `@toqar/registry`, `@toqar/registry-service`; broker/buffer behavior; compose integration test
- [ ] 1.4 `packages/isolation-suite/README.md` — the adversarial tenant-isolation suite; surfaces × credential classes; how new surfaces register
- [ ] 1.5 `packages/sdk/README.md` — the client SDK (leaf, no `@toqar/*` deps); install and emit events
- [ ] 1.6 `apps/web/README.md` — the per-tenant findings feed (not a dashboard grid); deps; run/test
- [ ] 1.7 Commit, PR, merge

## 2. Architecture overview (spec: contributor-docs)

- [ ] 2.1 `ARCHITECTURE.md` — dependency layering (leaves → services → composition → agents/isolation → apps) from the real `@toqar/*` graph; control-plane vs. data-plane; invariants (tenant isolation, citation/query-id contract, deterministic numbers)
- [ ] 2.2 Cross-link: root `README.md` → `ARCHITECTURE.md`; note `apps/docs`/`public-docs` owns the customer-facing docs
- [ ] 2.3 Commit, PR, merge

## 3. Contributor guide (spec: contributor-docs)

- [ ] 3.1 `CONTRIBUTING.md` — prerequisites (Node 20, pnpm), install/build/test, running the Docker-compose integration suite, the anti-slop gate
- [ ] 3.2 Commit, PR, merge

## 4. Drift check + close-out (spec: contributor-docs)

- [ ] 4.1 `scripts/check-contributor-docs.sh` (or equivalent): assert every `packages/*` and `apps/*` has a README, README `@toqar/*` deps match `package.json`, referenced scripts exist
- [ ] 4.2 Wire the check into CI (compose with the anti-slop gate); TDD: a deliberately stale claim fails it
- [ ] 4.3 `openspec validate --strict`; full gates green; commit, PR, merge
