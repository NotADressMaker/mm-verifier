import { MMVVerifierConfig } from '../../../shared/types';

export function loadMMVConfig(): MMVVerifierConfig {
  return {
    provider: 'openai',
    model: process.env.MAMV_MODEL || process.env.MMV_MODEL || 'gpt-4-turbo',
    maxRollouts: parseInt(process.env.MAMV_MAX_ROLLOUTS || process.env.MMV_MAX_ROLLOUTS || '5', 10),
    minPassScore: parseInt(process.env.MAMV_MIN_PASS_SCORE || process.env.MMV_MIN_PASS_SCORE || '75', 10),
    minCandidateScore: parseInt(process.env.MAMV_MIN_CANDIDATE_SCORE || process.env.MMV_MIN_CANDIDATE_SCORE || '65', 10),
    timeoutMs: parseInt(process.env.MAMV_TIMEOUT_MS || process.env.MMV_TIMEOUT_MS || '20000', 10),
    rateLimitPerMinute: parseInt(process.env.MAMV_RATE_LIMIT_PER_MINUTE || process.env.MMV_RATE_LIMIT_PER_MINUTE || '30', 10),
    version: process.env.MAMV_VERIFIER_VERSION || process.env.MMV_VERIFIER_VERSION || 'mamv-verifier@1.0.0',
  };
}
