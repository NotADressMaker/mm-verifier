import { Claim, Finding, FindingStatus, Severity, VerificationContext, VerificationMethod } from '../core/models';
import { identifier } from '../core/hashing';
export function finding(
  claim: Claim, context: VerificationContext, checker: { name: string; version: string },
  status: FindingStatus, severity: Severity, reason: string, method: VerificationMethod,
  options: Partial<Pick<Finding, 'assumptions' | 'limitations' | 'suggested_revision'>> = {}
): Finding {
  return { finding_id: identifier('f'), claim_id: claim.claim_id, claim_text: claim.text, status, severity, reason, evidence: [], counterevidence: [], assumptions: options.assumptions ?? [], limitations: options.limitations ?? [], verification_method: method, checker, suggested_revision: options.suggested_revision, reproducibility: { verifier_version: context.verifier_version, input_hash: context.input_hash, timestamp: context.timestamp, profile: context.profile, checker_versions: { [checker.name]: checker.version } } };
}
