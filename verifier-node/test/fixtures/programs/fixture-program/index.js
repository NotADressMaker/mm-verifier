const path = require('path');

const receiptSchema = require(path.join(__dirname, '../../../../shared/schemas/receipt.v1.schema.json'));
const evidenceSchema = require(path.join(
  __dirname,
  '../../../../shared/schemas/evidence_bundle.v1.schema.json'
));

const program = {
  id: 'fixture-program',
  version: '1.2.3',
  description: 'Fixture program for registry tests.',
  input_schema: evidenceSchema,
  output_schema: receiptSchema,
  evidence_requirements: {
    required_sections: ['claims', 'metrics', 'model_runs'],
    min_model_runs: 1,
  },
  run: async (bundle, context) => ({
    version: '1.0.0',
    receipt_version: '1.0.0',
    task_id: context.task_id,
    generated_at: Math.floor(Date.now() / 1000),
    input_hash: context.input_hash,
    output_hash: context.output_hash,
    score_bps: bundle.final_score_bps,
    verdict: bundle.final_score_bps >= 5000,
    worthy: bundle.final_score_bps >= 8000,
    program: {
      id: 'fixture-program',
      version: '1.2.3',
      hash: context.program_hash,
    },
    evidence: {
      bundle_hash: context.bundle_hash,
      bundle_uri: context.bundle_uri,
      bundle_version: context.bundle_version,
    },
    provenance: {
      llm_provider: context.llm_provider,
      llm_model: context.llm_model,
      verifier_node: context.verifier_node,
      software_version: context.software_version,
    },
    explain: {
      version: '1.0.0',
      score_components: [],
      checks: {},
      contradictions_found: [],
      citation_checks: [],
      model_disagreement: {
        models: [],
        agreement_rate: 0,
      },
    },
  }),
};

module.exports = { program };
