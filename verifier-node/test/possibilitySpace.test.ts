import { buildReceipt, computeReceiptHash, validateReceipt } from '../../shared/receipt';
import { DEFAULT_VERIFICATION_POSSIBILITY_SPACE, deriveLegacyPossibilitySpaceFields, normalizeVerificationPossibilitySpace, validateVerificationPossibilitySpace } from '../../shared/possibilitySpace';
import { computeProgramFingerprint } from '../../shared/programs';

const hash = `0x${'a'.repeat(64)}` as `0x${string}`;
const program = {
  name: 'evidence-first', version: '1', steps: [{ type: 'evidence' as const }],
  scoring: { method: 'weighted_sum' as const, components: [{ id: 'coverage', weight_bps: 10000 }] },
  thresholds: { pass_bps: 5000, worthy_bps: 8000 },
  receipt: { schema_version: '1' as const, receipt_version: '1.0.0', explain_version: '1.0.0' },
  possibility_space: DEFAULT_VERIFICATION_POSSIBILITY_SPACE,
};

describe('VerificationPossibilitySpace', () => {
  it('rejects inconsistent legacy fields rather than silently ignoring them', () => {
    expect(validateVerificationPossibilitySpace({ ...DEFAULT_VERIFICATION_POSSIBILITY_SPACE, interpretation_alternatives: [] })).toContain('interpretation_alternatives must be derived from worlds');
  });
  it('normalizes legacy-only program declarations and derives compatibility fields', () => {
    const normalized = normalizeVerificationPossibilitySpace({ id: 'legacy', version: '1', claim_types: ['factual'], evidence_relation_types: ['supports'], assessment_outcomes: ['Supported'], boundary_outcomes: ['AMBIGUOUS_INTERPRETATION'], interpretation_alternatives: [{ id: 'ordinary-reading', label: 'Ordinary reading' }] });
    expect(normalized.allowed_claim_types).toEqual(['factual']);
    expect(deriveLegacyPossibilitySpaceFields(normalized).claim_types).toEqual(['factual']);
  });

  it('commits the program fingerprint to permitted distinctions', () => {
    expect(computeProgramFingerprint(program)).not.toBe(computeProgramFingerprint({ ...program, possibility_space: { ...program.possibility_space, claim_types: ['factual'] } }));
  });

  it('binds the receipt to its possibility space and declared interpretation', () => {
    const receipt = buildReceipt({ task_id: 'space-test', input_hash: hash, output_hash: hash, score_bps: 7000, bundle_hash: hash, bundle_uri: 'ipfs://bundle', llm_provider: 'test', llm_model: 'test', program, verification_context: {
      verification_program_id: 'evidence-first', verification_program_version: '1', verification_program_fingerprint: computeProgramFingerprint(program), evidence_scope: 'submitted sources', policy_thresholds: {}, source_independence_rules: {}, possibility_space: DEFAULT_VERIFICATION_POSSIBILITY_SPACE, interpretation: { selected_interpretation_id: 'ordinary-reading', summary: 'Ordinary reading selected.', assumptions: [], ambiguity_status: 'unambiguous' }, run_timestamp: '2026-07-19T00:00:00.000Z',
    } });
    expect(validateReceipt(receipt).valid).toBe(true);
    expect(computeReceiptHash(receipt)).not.toBe(computeReceiptHash({ ...receipt, verification_context: { ...receipt.verification_context!, possibility_space: { ...DEFAULT_VERIFICATION_POSSIBILITY_SPACE, claim_types: ['factual'] } } }));
  });

  it('rejects a selected interpretation outside the declared alternatives', () => {
    expect(() => buildReceipt({ task_id: 'bad-space', input_hash: hash, output_hash: hash, score_bps: 0, bundle_hash: hash, bundle_uri: 'ipfs://bundle', llm_provider: 'test', llm_model: 'test', verification_context: { verification_program_id: 'p', verification_program_version: '1', verification_program_fingerprint: hash, evidence_scope: 'sources', policy_thresholds: {}, source_independence_rules: {}, possibility_space: DEFAULT_VERIFICATION_POSSIBILITY_SPACE, interpretation: { selected_interpretation_id: 'missing', summary: '', assumptions: [], ambiguity_status: 'unambiguous' }, run_timestamp: '2026-07-19T00:00:00.000Z' } })).toThrow('must be declared');
  });
});
