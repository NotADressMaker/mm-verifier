import { Checker } from '../checkers/base';
import { ConsistencyChecker } from '../checkers/consistency';
import { LogicalChecker } from '../checkers/logical';
import { UnsupportedClaimChecker } from '../checkers/unsupportedClaim';
import { extractClaims } from '../extractors/claims';
import { identifier, sha256, utcNow } from './hashing';
import { CheckerRegistry } from './registry';
import { Claim, Finding, VerificationContext, VerificationRun, OVP_VERSION } from './models';

export interface VerifyInput { text: string; inputType?: string; profile?: string; sources?: VerificationContext['sources']; networkEnabled?: boolean; llmEnabled?: boolean; }
export class VerificationPipeline {
  constructor(private readonly registry: CheckerRegistry = defaultRegistry(), private readonly verifierVersion = '0.1.0') {}
  async verify(input: VerifyInput): Promise<VerificationRun> {
    const claims = extractClaims(input.text);
    this.identifyDependencies(claims);
    const context: VerificationContext = { input: input.text, input_hash: sha256(input.text), profile: input.profile ?? 'quick-chat', claims, sources: input.sources, network_enabled: input.networkEnabled ?? false, llm_enabled: input.llmEnabled ?? false, verifier_version: this.verifierVersion, timestamp: utcNow() };
    const findings: Finding[] = []; const failures: Array<{ checker: string; message: string }> = [];
    for (const claim of claims) for (const checker of this.registry.forClaim(claim)) {
      try { findings.push(...await checker.check(claim, context)); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error); failures.push({ checker: checker.name, message });
        findings.push(checkerFailure(claim, context, checker, message));
      }
    }
    return { ovp_version: OVP_VERSION, run_id: identifier('run'), input: { type: input.inputType ?? 'text', hash: context.input_hash }, claims, findings, disagreements: disagreements(findings), provenance: { verifier_version: this.verifierVersion, profile: context.profile, timestamp: context.timestamp, input_hash: context.input_hash, checker_versions: this.registry.versions(), network_used: context.network_enabled, llm_used: context.llm_enabled, checker_failures: failures } };
  }
  private identifyDependencies(claims: Claim[]): void { for (let index = 1; index < claims.length; index++) if (/^(therefore|thus|hence|this|it)\b/i.test(claims[index].text)) claims[index].dependencies.push(claims[index - 1].claim_id); }
}
function checkerFailure(claim: Claim, context: VerificationContext, checker: Checker, message: string): Finding {
  return { finding_id: identifier('f'), claim_id: claim.claim_id, claim_text: claim.text, status: 'error', severity: 'medium', reason: `Checker failure: ${message}`, evidence: [], counterevidence: [], assumptions: [], limitations: ['Other checker results remain available.'], verification_method: 'human_required', checker: { name: checker.name, version: checker.version }, reproducibility: { verifier_version: context.verifier_version, input_hash: context.input_hash, timestamp: context.timestamp, profile: context.profile, checker_versions: { [checker.name]: checker.version } } };
}
function disagreements(findings: Finding[]): VerificationRun['disagreements'] {
  const grouped = new Map<string, Finding[]>(); for (const value of findings) grouped.set(value.claim_id, [...(grouped.get(value.claim_id) ?? []), value]);
  return [...grouped.entries()].flatMap(([claim_id, values]) => values.some((v) => v.status === 'contradicted') && values.some((v) => v.status === 'verified') ? [{ claim_id, finding_ids: values.map((v) => v.finding_id), reason: 'Checkers recorded contradictory observations.' }] : []);
}
export function defaultRegistry(): CheckerRegistry { const registry = new CheckerRegistry(); [new ConsistencyChecker(), new LogicalChecker(), new UnsupportedClaimChecker()].forEach((checker) => registry.register(checker)); return registry; }
