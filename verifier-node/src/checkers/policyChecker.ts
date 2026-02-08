import { CheckerResult } from './types';

export interface PolicyCheckerInput {
  text: string;
}

const DISALLOWED_TERMS = [
  'self-harm',
  'suicide',
  'terrorist',
  'explosive',
  'hate speech',
  'racial slur',
];

export function policyChecker(input: PolicyCheckerInput): CheckerResult {
  const lower = input.text.toLowerCase();
  const violations = DISALLOWED_TERMS.filter((term) => lower.includes(term));

  return {
    name: 'policy_checker',
    status: violations.length === 0 ? 'pass' : 'fail',
    score_bps: violations.length === 0 ? 10000 : 0,
    findings: {
      violations,
    },
  };
}
