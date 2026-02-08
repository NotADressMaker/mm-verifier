import { ReceiptExplain } from '../../../shared/receipt';
import { arithmeticChecker } from './arithmeticChecker';
import { citationChecker, CitationClaim } from './citationChecker';
import { codeExecutionChecker } from './codeExecutionChecker';
import { policyChecker } from './policyChecker';

export interface DeterministicCheckerInput {
  responseText: string;
  claims?: CitationClaim[];
  codeSnippets?: string[];
}

export async function runDeterministicCheckers(
  input: DeterministicCheckerInput
): Promise<Pick<ReceiptExplain, 'score_components' | 'checks'>> {
  const citationResult = input.claims
    ? citationChecker({ claims: input.claims })
    : {
        name: 'citation_checker',
        status: 'skipped',
        score_bps: 0,
        findings: { reason: 'no_claims' },
      };

  const arithmeticResult = arithmeticChecker({ text: input.responseText });
  const policyResult = policyChecker({ text: input.responseText });

  const codeResults = input.codeSnippets
    ? await Promise.all(input.codeSnippets.map((code) => codeExecutionChecker({ code })))
    : [];

  const codeScore =
    codeResults.length === 0
      ? { score_bps: 0, status: 'skipped' }
      : {
          score_bps: Math.round(
            codeResults.reduce((sum, result) => sum + result.score_bps, 0) / codeResults.length
          ),
          status: codeResults.some((result) => result.status === 'fail') ? 'fail' : 'pass',
        };

  const scoreComponents: ReceiptExplain['score_components'] = [
    {
      name: 'citation_checker',
      score_bps: citationResult.score_bps,
      weight_bps: 2500,
      notes: citationResult.status,
    },
    {
      name: 'arithmetic_checker',
      score_bps: arithmeticResult.score_bps,
      weight_bps: 2500,
      notes: arithmeticResult.status,
    },
    {
      name: 'code_execution_checker',
      score_bps: codeScore.score_bps,
      weight_bps: 2500,
      notes: codeScore.status,
    },
    {
      name: 'policy_checker',
      score_bps: policyResult.score_bps,
      weight_bps: 2500,
      notes: policyResult.status,
    },
  ];

  return {
    score_components: scoreComponents,
    checks: {
      citation_checker: citationResult,
      arithmetic_checker: arithmeticResult,
      code_execution_checker: codeResults,
      policy_checker: policyResult,
    },
  };
}
