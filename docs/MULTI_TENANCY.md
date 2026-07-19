# Multi-tenancy foundation

MAMV uses one PostgreSQL database and an `Organization` is the authorization boundary. `VerificationTask`, organization API keys, memberships, settings, and audit events are organization-scoped. Benchmark results, calibration models, verifier statistics, program definitions, and chain event data are global system data. A public receipt is an immutable, deliberately serialized view; it must not contain prompts, evidence, user data, API keys, or internal identifiers.

## Authentication and isolation

`/api/organizations/*` resolves tenant context only from a signed JWT's `sub` and `organizationId` after a membership lookup, or an `Authorization: Bearer mamv_...` organization API key. Client organization fields are ignored. API-key context always inherits its stored organization and is never overridden by headers or request bodies. Resource lookups filter both resource ID and organization ID and return 404 for cross-tenant resources.

Use `POST /api/organizations/switch` to validate a desired organization, then have the authentication issuer mint a refreshed JWT for that membership. The endpoint intentionally does not treat a browser-local selection as authorization.

## Migration and local setup

Run `cd api && npm run prisma:migrate:deploy && npm run prisma:seed`. The migration creates a default organization, backfills existing verification tasks before making their organization foreign key required, and adds tenant indexes. The seed creates two organizations, a shared owner, admin/member/viewer users, and tasks in each organization. It never prints or persists plaintext API keys.

## Follow-up scope

Legacy blockchain-derived and compatibility routes still need to be moved behind the tenant context before they can serve customer data in production. New tenant routes are the supported SaaS surface; deployers should disable unauthenticated legacy routes while completing that cutover.
