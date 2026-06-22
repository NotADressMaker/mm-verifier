import { GuardPolicy, policySchema } from './schemas';
const domainDefaults: Record<string, Partial<GuardPolicy>> = {
  general: {},
  medical: { thresholdBps: 9000, requireWorthy: true, anchor: true, taskType: 'medical-safety' },
  legal: { thresholdBps: 9000, requireWorthy: true, anchor: true, taskType: 'legal-review' },
  finance: { thresholdBps: 8750, requireWorthy: true, anchor: true, taskType: 'financial-claims' },
  marketing: { thresholdBps: 7600, requireWorthy: true, taskType: 'brand-safety' }
};
export function resolvePolicy(input: Partial<GuardPolicy> = {}): GuardPolicy {
  const domain = input.domain ?? 'general';
  return policySchema.parse({ ...domainDefaults[domain], ...input, domain });
}
export function isAccepted(scoreBps: number, verdict: boolean, policy: GuardPolicy) {
  const worthy = verdict && scoreBps >= policy.thresholdBps;
  return { worthy, accepted: verdict && scoreBps >= policy.thresholdBps && (!policy.requireWorthy || worthy) };
}
