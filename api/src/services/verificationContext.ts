import { hashCanonical } from '../../../shared/canonicalJson';
import { Verdict, verdictFromEvidence } from '../../../shared/verdicts';

/** Internal fields are deliberately enumerated: adding one requires a public decision. */
export const CONTEXT_SNAPSHOT_FIELDS = [
  'verification_program_id', 'verification_program_version', 'verification_program_snapshot',
  'organization_id', 'evidence_scope', 'enabled_providers_models', 'policy_thresholds',
  'source_independence_rules', 'jurisdiction_locale', 'domain', 'run_timestamp', 'software_version',
] as const;
export const PUBLIC_CONTEXT_SNAPSHOT_FIELDS = [
  'verification_program_id', 'verification_program_version', 'evidence_scope', 'policy_thresholds',
  'source_independence_rules', 'jurisdiction_locale', 'domain', 'run_timestamp', 'software_version',
] as const;
export const EXCLUDED_PUBLIC_CONTEXT_SNAPSHOT_FIELDS = ['verification_program_snapshot', 'organization_id', 'enabled_providers_models'] as const;

export type VerificationContextSnapshot = Record<(typeof CONTEXT_SNAPSHOT_FIELDS)[number], unknown>;
export function publicContext(snapshot: VerificationContextSnapshot): Record<string, unknown> {
  return Object.fromEntries(PUBLIC_CONTEXT_SNAPSHOT_FIELDS.map((key) => [key, snapshot[key]]));
}

export type EvidenceRelation = { relationType: 'supports' | 'contradicts' | 'qualifies' | 'contextualizes' | 'duplicates' | 'derives_from' | 'inconclusive'; sourceIndependenceGroup?: string | null; provenanceKind: 'evidence' | 'model'; evidenceId: string };
/** Only actual evidence relations in distinct source groups count; model votes never do. */
export function independentSupportCount(relations: EvidenceRelation[]): number {
  return new Set(relations.filter((r) => r.relationType === 'supports' && r.provenanceKind === 'evidence' && r.sourceIndependenceGroup).map((r) => r.sourceIndependenceGroup!)).size;
}

export type VerificationBoundary = 'INSUFFICIENT_EVIDENCE_COVERAGE' | 'UNSUPPORTED_CLAIM_TYPE' | 'SOURCE_INDEPENDENCE_UNAVAILABLE' | 'REQUIRED_SOURCE_INACCESSIBLE' | 'AMBIGUOUS_INTERPRETATION' | 'MALFORMED_EVIDENCE' | 'PROGRAM_RULE_MISSING' | 'MATERIAL_CLAIM_UNASSESSABLE';
export function contextVerdict(input: Parameters<typeof verdictFromEvidence>[0] & { boundary?: VerificationBoundary }): { verdict: Verdict; explanation: string } {
  if (input.boundary) return { verdict: 'Unable to verify', explanation: `Unable to verify: ${input.boundary.replace(/_/g, ' ').toLowerCase()}.` };
  const verdict = verdictFromEvidence(input);
  return { verdict, explanation: verdict === 'Unable to verify' ? 'Unable to verify: evidence coverage is below the documented threshold.' : `Assessment derived from declared verification conditions: ${verdict}.` };
}

export function contextReceiptHash(payload: Record<string, unknown>): `0x${string}` { return hashCanonical(payload) as `0x${string}`; }
export function assertCompletedReceiptImmutable(existing: { status: string }, patch: Record<string, unknown>): void {
  if (existing.status === 'COMPLETED' && Object.keys(patch).length) throw new Error('Completed verification receipts are immutable');
}
