import { GuardPolicy, policySchema } from './schemas';

export type PolicyDecision =
  | 'approved'
  | 'approved_with_warning'
  | 'manual_review'
  | 'rejected'
  | 'error';

export interface PolicyDecisionResult {
  decision: PolicyDecision;
  worthy: boolean;
  accepted: boolean;
  warnings: string[];
  reasons: string[];
}

const domainDefaults: Record<string, Partial<GuardPolicy>> = {
  general: {},
  medical: { thresholdBps: 9000, requireWorthy: true, anchor: true, taskType: 'medical-safety' },
  legal: { thresholdBps: 9000, requireWorthy: true, anchor: true, taskType: 'legal-review' },
  finance: { thresholdBps: 8750, requireWorthy: true, anchor: true, taskType: 'financial-claims' },
  marketing: { thresholdBps: 7600, requireWorthy: true, taskType: 'brand-safety' }
};

const highRiskDomains = new Set(['medical', 'legal', 'finance']);
const WARNING_BAND_BPS = 500;

export function resolvePolicy(input: Partial<GuardPolicy> = {}): GuardPolicy {
  const domain = input.domain ?? 'general';
  return policySchema.parse({ ...domainDefaults[domain], ...input, domain });
}

export function decidePolicy(
  scoreBps: number | null | undefined,
  verdict: boolean | null | undefined,
  policy: GuardPolicy,
  options: { anchorVerified?: boolean; anchorErrors?: string[] } = {}
): PolicyDecisionResult {
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (typeof scoreBps !== 'number' || typeof verdict !== 'boolean') {
    return {
      decision: 'error',
      worthy: false,
      accepted: false,
      warnings,
      reasons: ['MAMV did not return a final boolean verdict and numeric score.']
    };
  }

  const meetsThreshold = scoreBps >= policy.thresholdBps;
  const worthy = verdict && meetsThreshold;

  if (policy.anchor && options.anchorVerified === false) {
    warnings.push(
      `Onchain anchoring was requested but could not be confirmed: ${(options.anchorErrors ?? []).join('; ') || 'unknown error'}`
    );
  }

  if (!verdict) {
    return {
      decision: 'rejected',
      worthy: false,
      accepted: false,
      warnings,
      reasons: ['MAMV returned a negative verification verdict.']
    };
  }

  if (!meetsThreshold) {
    return {
      decision: highRiskDomains.has(policy.domain) ? 'manual_review' : 'approved_with_warning',
      worthy: false,
      accepted: !policy.requireWorthy && !highRiskDomains.has(policy.domain),
      warnings: [...warnings, `Score ${scoreBps} bps is below policy threshold ${policy.thresholdBps} bps.`],
      reasons: [`Score ${scoreBps} bps is below policy threshold ${policy.thresholdBps} bps.`]
    };
  }

  if (highRiskDomains.has(policy.domain) || scoreBps < policy.thresholdBps + WARNING_BAND_BPS || warnings.length > 0) {
    return {
      decision: 'approved_with_warning',
      worthy,
      accepted: true,
      warnings: highRiskDomains.has(policy.domain)
        ? [...warnings, `${policy.domain} outputs should receive human review before consequential use.`]
        : warnings,
      reasons: ['MAMV verdict and score meet policy requirements, with caveats.']
    };
  }

  return {
    decision: 'approved',
    worthy,
    accepted: true,
    warnings,
    reasons: ['MAMV verdict and score meet policy requirements.']
  };
}

/** @deprecated Use decidePolicy for the full multi-state policy decision. */
export function isAccepted(scoreBps: number, verdict: boolean, policy: GuardPolicy) {
  const decision = decidePolicy(scoreBps, verdict, policy);
  return { worthy: decision.worthy, accepted: decision.accepted };
}
