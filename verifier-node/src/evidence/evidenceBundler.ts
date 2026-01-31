import { Wallet } from 'ethers';
import { logger } from '../utils/logger';
import { ModelResponse } from '../llm-providers/modelRouter';
import { ScoringResult } from '../scoring/scorer';
import { extractClaims } from '../scoring/claimExtractor';
import {
  Claim,
  EvidenceBundle,
  Metrics,
  ModelRun,
  ScoringRubric,
} from '../../../shared/types';
import {
  createEvidenceBundle as createBundle,
  createModelRun,
  createClaim,
  createMetrics,
  hashRubric,
  signEvidenceBundle,
  DEFAULT_RUBRIC,
} from './evidenceBundlerV2';
import { getChainIdFromEnv } from '../../../shared/env';
import { toScoreBps } from '../utils/score';

type BundleInputs = {
  taskId: string;
  nodeId: string;
  ethAddress: string;
  promptHash: string;
  responses: ModelResponse[];
  scoringResult: ScoringResult;
  wallet: Wallet;
  marketplaceAddress: string;
  rubric?: ScoringRubric;
};

function toModelRuns(responses: ModelResponse[]): ModelRun[] {
  return responses.map((response) =>
    createModelRun(
      response.provider,
      response.model,
      response.metadata?.temperature ?? 0,
      response.response,
      {
        timestamp: response.timestamp ? Math.floor(response.timestamp / 1000) : undefined,
        latencyMs: response.metadata?.duration,
        tokensUsed: response.metadata?.tokensUsed,
        maxTokens: response.metadata?.maxTokens,
      }
    )
  );
}

function toClaims(responses: ModelResponse[]): Claim[] {
  const claims = responses.flatMap((response) => extractClaims(response.response));
  return claims.map((text, index) =>
    createClaim(`c${index + 1}`, text, 'factual', [], [])
  );
}

function toMetrics(responses: ModelResponse[], scoringResult: ScoringResult): Metrics {
  const claimCount = responses.reduce(
    (total, response) => total + extractClaims(response.response).length,
    0
  );
  const normalized = (value: number) => Math.max(0, Math.min(1, value / 100));
  const supportedRatio = normalized(scoringResult.breakdown.factualAccuracy);
  const verifiedClaims = claimCount > 0 ? Math.round(claimCount * supportedRatio) : 0;

  return createMetrics(
    {
      agreement: normalized(scoringResult.breakdown.consistency),
      clusters: responses.length ? 1 : 0,
      clusterSizes: responses.length ? [responses.length] : [],
      outliers: 0,
    },
    {
      supportedClaimRatio: supportedRatio,
      totalClaims: claimCount,
      verifiedClaims,
      contradictedClaims: claimCount - verifiedClaims,
    },
    {
      authorityScore: normalized(scoringResult.breakdown.citationQuality),
      sourceCount: undefined,
      highAuthorityRatio: undefined,
      citationDensity: undefined,
    },
    {
      sensitiveVariance: 0,
      politicalLean: undefined,
      sentimentVariance: undefined,
    },
    {
      reaskDelta: normalized(scoringResult.breakdown.agreement),
      lengthVariance: undefined,
      tokenVariance: undefined,
    }
  );
}

export async function createEvidenceBundle({
  taskId,
  nodeId,
  ethAddress,
  promptHash,
  responses,
  scoringResult,
  wallet,
  marketplaceAddress,
  rubric = DEFAULT_RUBRIC,
}: BundleInputs): Promise<EvidenceBundle> {
  if (!marketplaceAddress) {
    throw new Error('MARKETPLACE_ADDRESS is required to sign evidence bundles');
  }

  logger.info('Creating v0.1 evidence bundle', { taskId, ethAddress });

  const modelRuns = toModelRuns(responses);
  const claims = toClaims(responses);
  const metrics = toMetrics(responses, scoringResult);
  const rubricHash = hashRubric(rubric);
  const finalScoreBps = toScoreBps(scoringResult.score);

  const bundle = createBundle(
    taskId,
    nodeId,
    ethAddress,
    promptHash,
    rubricHash,
    modelRuns,
    claims,
    metrics,
    finalScoreBps,
    scoringResult.reasoning
  );

  const envChainId = getChainIdFromEnv();
  const network = wallet.provider ? await wallet.provider.getNetwork() : undefined;
  const chainId = envChainId ?? (network ? Number(network.chainId) : undefined);

  if (!chainId) {
    throw new Error('Chain ID not available for EIP-712 signing');
  }

  return signEvidenceBundle(bundle, wallet, marketplaceAddress, chainId);
}

export type { EvidenceBundle };
