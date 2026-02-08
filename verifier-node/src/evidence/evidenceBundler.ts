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
  createEvidence,
} from './evidenceBundlerV2';
import { getChainIdFromEnv } from '../../../shared/env';
import { toScoreBps } from '../utils/score';
import { buildClaimGraph, findContradictions } from '../../../shared/claim_graph';

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
        modelVersion: response.provider_call?.model_version,
        timestamp: response.timestamp ? Math.floor(response.timestamp / 1000) : undefined,
        latencyMs: response.metadata?.duration,
        tokensUsed: response.metadata?.tokensUsed,
        tokensIn: response.provider_call?.tokens_in,
        tokensOut: response.provider_call?.tokens_out,
        maxTokens: response.metadata?.maxTokens,
        topP: response.metadata?.topP,
        seed: response.metadata?.seed,
        requestId: response.metadata?.requestId,
        providerRequestId: response.provider_call?.provider_request_id,
        systemPromptHash: response.provider_call?.system_prompt_hash,
      }
    )
  );
}

function toClaims(responses: ModelResponse[]): Claim[] {
  const graphs = responses.map((response) => buildClaimGraph(response.response));
  const contradictions = graphs.flatMap((graph, index) =>
    graphs.slice(index + 1).flatMap((other) => findContradictions(graph, other))
  );
  const contradictionMap = new Map<string, string[]>();
  contradictions.forEach((edge) => {
    contradictionMap.set(edge.from, [
      ...(contradictionMap.get(edge.from) ?? []),
      edge.evidence ?? 'contradiction',
    ]);
    contradictionMap.set(edge.to, [
      ...(contradictionMap.get(edge.to) ?? []),
      edge.evidence ?? 'contradiction',
    ]);
  });

  const claims: Claim[] = [];
  let index = 0;
  graphs.forEach((graph) => {
    graph.nodes.forEach((node) => {
      if (node.type !== 'claim') return;
      const support = (node.citations ?? []).map((citation) =>
        createEvidence(citation.url, node.text)
      );
      const contradictions = (contradictionMap.get(node.id) ?? []).map((evidence, i) =>
        createEvidence(`internal://contradiction/${node.id}/${i}`, evidence)
      );
      claims.push(
        createClaim(`c${index + 1}`, node.text, 'factual', support, contradictions)
      );
      index += 1;
    });
  });

  if (claims.length === 0) {
    const fallback = responses.flatMap((response) => extractClaims(response.response));
    fallback.forEach((text) => {
      claims.push(createClaim(`c${index + 1}`, text, 'factual', [], []));
      index += 1;
    });
  }

  return claims;
}

function toMetrics(responses: ModelResponse[], scoringResult: ScoringResult): Metrics {
  const claimCount =
    scoringResult.claim_graph.total_claims ||
    responses.reduce(
      (total, response) => total + extractClaims(response.response).length,
      0
    );
  const normalized = (value: number) => Math.max(0, Math.min(1, value / 100));
  const supportedRatio = normalized(scoringResult.breakdown.factualAccuracy);
  const verifiedClaims = claimCount > 0 ? Math.round(claimCount * supportedRatio) : 0;
  const contradictedClaims =
    scoringResult.claim_graph.contradiction_count > 0
      ? scoringResult.claim_graph.contradiction_count
      : claimCount - verifiedClaims;

  return createMetrics(
    {
      agreement: normalized(scoringResult.breakdown.agreement),
      clusters: responses.length ? 1 : 0,
      clusterSizes: responses.length ? [responses.length] : [],
      outliers: 0,
    },
    {
      supportedClaimRatio: supportedRatio,
      totalClaims: claimCount,
      verifiedClaims,
      contradictedClaims,
    },
    {
      authorityScore: normalized(scoringResult.breakdown.citationQuality),
      sourceCount: undefined,
      highAuthorityRatio: undefined,
      citationDensity: scoringResult.claim_graph.citation_coverage,
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

  logger.info('Creating evidence bundle', { taskId, ethAddress });

  const modelRuns = toModelRuns(responses);
  const claims = toClaims(responses);
  const metrics = toMetrics(responses, scoringResult);
  const rubricHash = hashRubric(rubric);
  const finalScoreBps = toScoreBps(scoringResult.score);
  const bundleVersion = process.env.EVIDENCE_BUNDLE_VERSION;
  const resolvedBundleVersion =
    bundleVersion === '0.1' || bundleVersion === '0.2' || bundleVersion === '0.3'
      ? bundleVersion
      : undefined;

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
    scoringResult.reasoning,
    {
      bundleVersion: resolvedBundleVersion,
      scoringBreakdown: {
        consistency: scoringResult.breakdown.consistency,
        agreement: scoringResult.breakdown.agreement,
        citationQuality: scoringResult.breakdown.citationQuality,
        factualAccuracy: scoringResult.breakdown.factualAccuracy,
      },
      scoringWeights: {
        consistency: 0.3,
        agreement: 0.3,
        citation_quality: 0.2,
        factual_accuracy: 0.2,
      },
    }
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
