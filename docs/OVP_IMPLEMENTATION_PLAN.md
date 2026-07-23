# OVP implementation plan and repository assessment

## Repository assessment

MAMV is a TypeScript/Node.js monorepo. Its `verifier-node` package already owns
claim extraction, deterministic checkers, a `mamv` command, JSON-schema
validation, and receipt/evidence primitives. The API and dashboard consume the
existing receipt system. Introducing a parallel Python runtime now would split
verification semantics and make existing deployments incompatible.

## Proposed compatible architecture

Phase 1–2 adds a provider-neutral OVP core at `verifier-node/src/ovp/`. It is
an adapter-facing engine, not a replacement for historical MAMV receipts:

- `core/`: OVP models, hashing, registry, and orchestration pipeline.
- `extractors/` and `classifiers/`: span-preserving, deterministic input
  decomposition and conservative claim typing.
- `checkers/`: typed extension boundary plus consistency, logical, and
  unsupported-claim checkers.
- `reports/`: OVP JSON and Markdown renderers.
- `cli`: existing `mamv` command gains `verify`, `verify-claim`, and
  `verify-argument` adapters.
- root `schemas/`: implementation-independent OVP interchange schemas.

Existing receipt scoring, program governance, API routes, and onchain behavior
remain unchanged. Future API, MCP, GitHub, bibliographic, formal-tool, plugin,
and SARIF adapters will invoke this core rather than duplicate it.

## Compatibility plan

1. Keep current receipt and its six evidential verdicts unchanged.
2. Treat OVP finding statuses as per-checker observations, not receipt verdicts.
3. Bind OVP results to input hashes, checker versions, profile, and timestamp.
4. Preserve every checker finding, including failures and conflicts; do not
   compute support from checker count or model agreement.
5. Add adapter integrations only after their authorization, privacy, and
   versioning behavior is documented.

## Phased checklist

- [x] **Phase 1:** assess repository, map architecture, record compatibility,
  and add ADRs.
- [x] **Phase 2:** define OVP schemas/models, extraction, classification,
  registry/routing, three deterministic checkers, reports, CLI, examples, and
  focused tests.
- [ ] **Phase 3:** REST and MCP adapters, challenge/audit adapters, GitHub
  repository/PR readers.
- [ ] **Phase 4:** SARIF, GitHub Action, Crossref, optional formal adapters,
  and external-plugin discovery.
- [ ] **Phase 5:** expanded benchmarks, full integration/privacy tests,
  packaging and release work.

## Unresolved decisions

- Whether OVP becomes a separately versioned npm package or remains exported by
  `@mamv/verifier-node` needs maintainer release-policy approval.
- The existing project is MIT-licensed while the requested Apache-2.0 code
  license would require a repository-wide licensing decision; this change does
  not silently relicense existing work.
- Remote MCP transport, GitHub token scope, and external checker sandboxing are
  deferred because they materially affect security and privacy policy.
