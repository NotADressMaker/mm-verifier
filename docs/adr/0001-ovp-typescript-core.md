# ADR 0001: Add OVP as a TypeScript core in verifier-node

**Status:** Accepted for the initial implementation.

## Context

The repository is a TypeScript monorepo and `verifier-node` already contains
MAMV's verification primitives and CLI. A new Python implementation would be a
second core with incompatible lifecycle and receipt semantics.

## Decision

Implement the Open Verification Protocol core as typed TypeScript modules under
`verifier-node/src/ovp`. Define interchange independently through root JSON
Schemas and documentation. Keep GitHub, MCP, providers, and other transports
as thin adapters around the core.

## Consequences

This preserves existing Node deployments and gives third parties a typed
checker interface. It does not preclude a future Python binding generated from
OVP schemas. OVP finding observations are not substituted for the established
six MAMV receipt verdicts.
