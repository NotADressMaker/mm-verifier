import { MMVVerifierConfig } from '../../../shared/types';

export interface MetacognitiveReasoningConfig {
  enabled: boolean;
  strategy: 'direct' | 'structured_reasoning' | 'self_consistency' | 'self_refine' | 'multi_model_debate';
  numSamples: number;
  maxRefineIterations: number;
  enableMultiModelDebate: boolean;
  requireGrounding: boolean;
  requireAssumptions: boolean;
  requireEvidenceReferences: boolean;
  exposeReasoningSummaries: boolean;
}
const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};
export function loadMetacognitiveReasoningConfig(env = process.env): MetacognitiveReasoningConfig {
  const strategy = env.MAMV_REASONING_STRATEGY ?? env.MMV_REASONING_STRATEGY ?? 'direct';
  const valid = ['direct', 'structured_reasoning', 'self_consistency', 'self_refine', 'multi_model_debate'];
  return { enabled: (env.MAMV_REASONING_ENABLED ?? env.MMV_REASONING_ENABLED) === 'true', strategy: (valid.includes(strategy) ? strategy : 'direct') as MetacognitiveReasoningConfig['strategy'], numSamples: boundedInteger(env.MAMV_REASONING_NUM_SAMPLES ?? env.MMV_REASONING_NUM_SAMPLES, 3, 1, 10), maxRefineIterations: boundedInteger(env.MAMV_REASONING_MAX_REFINE_ITERATIONS ?? env.MMV_REASONING_MAX_REFINE_ITERATIONS, 2, 1, 5), enableMultiModelDebate: (env.MAMV_REASONING_ENABLE_MULTI_MODEL_DEBATE ?? env.MMV_REASONING_ENABLE_MULTI_MODEL_DEBATE) === 'true', requireGrounding: (env.MAMV_REASONING_REQUIRE_GROUNDING ?? env.MMV_REASONING_REQUIRE_GROUNDING) === 'true', requireAssumptions: (env.MAMV_REASONING_REQUIRE_ASSUMPTIONS ?? env.MMV_REASONING_REQUIRE_ASSUMPTIONS) === 'true', requireEvidenceReferences: (env.MAMV_REASONING_REQUIRE_EVIDENCE_REFERENCES ?? env.MMV_REASONING_REQUIRE_EVIDENCE_REFERENCES) === 'true', exposeReasoningSummaries: (env.MAMV_REASONING_EXPOSE_SUMMARIES ?? env.MMV_REASONING_EXPOSE_SUMMARIES) === 'true' };
}

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
