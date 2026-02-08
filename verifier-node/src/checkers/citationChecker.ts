import { CheckerResult } from './types';

export interface CitationClaim {
  text: string;
  citations: string[];
}

export interface CitationCheckerInput {
  claims: CitationClaim[];
}

export function citationChecker(
  input: CitationCheckerInput
): CheckerResult<{ total_claims: number; missing_citations: string[] }> {
  const missing = input.claims.filter((claim) => claim.citations.length === 0);
  const total = input.claims.length;
  const score = total === 0 ? 10000 : Math.round(((total - missing.length) / total) * 10000);

  return {
    name: 'citation_checker',
    status: missing.length === 0 ? 'pass' : 'fail',
    score_bps: score,
    findings: {
      total_claims: total,
      missing_citations: missing.map((claim) => claim.text),
    },
  };
}
