import { MMVVerifierConfig } from '../../../shared/types';

export function loadMMVConfig(): MMVVerifierConfig {
  return {
    provider: 'openai',
    model: process.env.MMV_MODEL || 'gpt-4-turbo',
    maxRollouts: parseInt(process.env.MMV_MAX_ROLLOUTS || '5', 10),
    minPassScore: parseInt(process.env.MMV_MIN_PASS_SCORE || '75', 10),
    minCandidateScore: parseInt(process.env.MMV_MIN_CANDIDATE_SCORE || '65', 10),
    timeoutMs: parseInt(process.env.MMV_TIMEOUT_MS || '20000', 10),
    rateLimitPerMinute: parseInt(process.env.MMV_RATE_LIMIT_PER_MINUTE || '30', 10),
    version: process.env.MMV_VERIFIER_VERSION || 'mmv-verifier@1.0.0',
  };
}
