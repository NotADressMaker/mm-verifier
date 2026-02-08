const evidenceBundleSchema = require('../../shared/schemas/evidence_bundle.v1.schema.json');
const receiptSchema = require('../../shared/schemas/receipt.v1.schema.json');

const PROGRAM_ID = 'factual-consensus';
const PROGRAM_VERSION = '1.0.0';

function toBps(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  const normalized = Math.max(0, Math.min(100, score));
  return Math.round((normalized / 100) * 10000);
}

function buildExplain(bundle, context) {
  const breakdown = bundle.scoring_trace?.breakdown ?? {};
  const weights = bundle.scoring_trace?.weights ?? {};
  const components = [
    { name: 'consistency', score_bps: toBps(breakdown.consistency ?? 0), weight_bps: toBps((weights.consistency ?? 0) * 100) },
    { name: 'agreement', score_bps: toBps(breakdown.agreement ?? 0), weight_bps: toBps((weights.agreement ?? 0) * 100) },
    { name: 'citation_quality', score_bps: toBps(breakdown.citation_quality ?? 0), weight_bps: toBps((weights.citation_quality ?? 0) * 100) },
    { name: 'factual_accuracy', score_bps: toBps(breakdown.factual_accuracy ?? 0), weight_bps: toBps((weights.factual_accuracy ?? 0) * 100) },
  ].map((component) => ({
    ...component,
    weight_bps: component.weight_bps > 0 ? component.weight_bps : undefined,
  }));

  const contradictionsFound = (bundle.claims ?? [])
    .filter((claim) => Array.isArray(claim.contradictions) && claim.contradictions.length > 0)
    .map((claim) => ({
      type: 'claim-contradiction',
      severity: 'medium',
      summary: `Contradictions found for claim: ${claim.text}`,
      evidence_refs: claim.contradictions.map((item) => item.url),
    }));

  const citationChecks = (bundle.claims ?? []).map((claim) => {
    const supportCount = claim.support?.length ?? 0;
    const contradictionCount = claim.contradictions?.length ?? 0;
    let verdict = 'unsupported';
    if (supportCount > 0 && contradictionCount === 0) verdict = 'supported';
    if (supportCount > 0 && contradictionCount > 0) verdict = 'mixed';

    return {
      claim: claim.text,
      sources: [...(claim.support ?? []), ...(claim.contradictions ?? [])].map((item) => item.url),
      verdict,
      notes: supportCount === 0 ? 'No supporting citations found.' : undefined,
    };
  });

  return {
    version: '1.0.0',
    score_components: components,
    checks: {
      citations: {
        total_claims: bundle.claims?.length ?? 0,
        checked_claims: bundle.claims?.length ?? 0,
      },
      contradictions: {
        contradictions_found: contradictionsFound.length,
      },
      disagreement: {
        agreement_rate: bundle.metrics?.consensus?.agreement ?? 0,
      },
      policy: {},
    },
    contradictions_found: contradictionsFound,
    citation_checks: citationChecks,
    model_disagreement: {
      models: (bundle.model_runs ?? []).map((run) => `${run.provider}:${run.model}`),
      agreement_rate: bundle.metrics?.consensus?.agreement ?? 0,
      clusters: bundle.metrics?.consensus?.cluster_sizes
        ? bundle.metrics.consensus.cluster_sizes.map((size, index) => ({
            cluster: index + 1,
            size,
          }))
        : undefined,
    },
    timings_ms: context.timings_ms,
  };
}

const program = {
  id: PROGRAM_ID,
  version: PROGRAM_VERSION,
  description:
    'Multi-model consensus verification for factual claims. Queries multiple LLMs, extracts claims, cross-checks for consistency, and scores based on agreement.',
  input_schema: evidenceBundleSchema,
  output_schema: receiptSchema,
  evidence_requirements: {
    required_sections: ['claims', 'metrics', 'model_runs'],
    min_model_runs: 1,
  },
  scoring_rubric: {
    weights: {
      consistency: 0.3,
      agreement: 0.3,
      citation_quality: 0.2,
      factual_accuracy: 0.2,
    },
    pass_threshold_bps: 5000,
    worthy_threshold_bps: 8000,
  },
  run: async (bundle, context) => {
    const scoreBps = bundle.final_score_bps;
    const explain = buildExplain(bundle, context);
    const now = Math.floor(Date.now() / 1000);

    return {
      version: '1.0.0',
      receipt_version: '1.0.0',
      task_id: context.task_id,
      generated_at: now,
      input_hash: context.input_hash,
      output_hash: context.output_hash,
      score_bps: scoreBps,
      verdict: scoreBps >= 5000,
      worthy: scoreBps >= 8000,
      program: {
        id: PROGRAM_ID,
        version: PROGRAM_VERSION,
        hash: context.program_hash,
      },
      evidence: {
        bundle_hash: context.bundle_hash,
        bundle_uri: context.bundle_uri,
        bundle_version: context.bundle_version,
      },
      metering: context.metering,
      provenance: {
        llm_provider: context.llm_provider,
        llm_model: context.llm_model,
        verifier_node: context.verifier_node,
        software_version: context.software_version,
      },
      chain_context: {
        chain_id: context.chain_id,
        contract_address: context.contract_address,
        finalized_at: now,
        block_number: 0,
        tx_hash: '0x' + '00'.repeat(32),
      },
      explain,
    };
  },
};

module.exports = { program };
