import { buildReceipt, computeReceiptHash, validateReceipt } from '../../shared/receipt';
import { buildPossibilitySpace, assessAllWorlds, evaluateWorldDistinction, stabilizeClaims, possibilityAwareVerdict, claimRivalryHistory, type WorldClaim, type WorldEvidenceRelation } from '../../shared/possibilityAwareVerification';

const now = '2026-07-19T00:00:00.000Z'; const hash = `0x${'b'.repeat(64)}` as `0x${string}`;
const world = (id: string, interpretation: string) => ({ id, interpretation, world_type: 'interpretive' as const, assumptions: ['The date refers to the report date.'], material_difference: interpretation, distinguishing_conditions: ['An official dated record'], predicted_observations: ['A dated record exists'], status: 'candidate' as const });
const claim = (world_ids: string[]): WorldClaim => ({ id: 'claim-1', organization_id: 'org-a', verification_run_id: 'run-a', world_ids, original_text: 'The report was published Tuesday.', normalized_text: 'report publication date', claim_type: 'factual', assumptions: ['Publication means public availability.'], scope: 'the named report', materiality_weight: 1, status: 'active', version: 1, created_at: now, updated_at: now });
const relation = (world_id: string, type: WorldEvidenceRelation['relation_type'], group = 'source-1'): WorldEvidenceRelation => ({ id: `${world_id}-${type}`, organization_id: 'org-a', verification_run_id: 'run-a', world_id, claim_id: 'claim-1', evidence_id: 'evidence-1', relation_type: type, rationale: 'Dated primary record.', source_independence_group: group, provenance: { method: 'primary-record' }, created_at: now });

describe('possibility-aware verification', () => {
  it('builds an unambiguous single-world assessment and immutable context-v2 receipt', () => {
    const space = buildPossibilitySpace({ input_summary: 'Publication date claim', organization_id: 'org-a', program_id: 'p', program_version: '1', program_fingerprint: hash, worlds: [world('w1', 'The stated date is publication date')], created_at: now });
    const claims = [claim(['w1'])], relations = [relation('w1', 'supports')], assessments = assessAllWorlds(space.worlds!, claims, relations), distinction = evaluateWorldDistinction(space.worlds!, claims, assessments), stabilized = stabilizeClaims(claims, relations, assessments, distinction), verdict = possibilityAwareVerdict(space, assessments, distinction, stabilized);
    expect(distinction.recommended_action).toBe('produce_verdict'); expect(verdict.status).toBe('Mostly supported'); // one source cannot satisfy Supported policy
    const receipt = buildReceipt({ task_id: 'mw-1', input_hash: hash, output_hash: hash, score_bps: 7000, bundle_hash: hash, bundle_uri: 'ipfs://bundle', llm_provider: 'test', llm_model: 'test', possibility_space: space, world_assessments: assessments, distinction_check: distinction, stabilized_claims: stabilized, selected_world_ids: verdict.selected_world_ids, unresolved_world_ids: verdict.unresolved_world_ids, verification_context: { verification_program_id: 'p', verification_program_version: '1', verification_program_fingerprint: hash, evidence_scope: 'record', policy_thresholds: {}, source_independence_rules: {}, possibility_space: space, run_timestamp: now } });
    expect(receipt.context_version).toBe('context-v2'); expect(validateReceipt(receipt).valid).toBe(true); expect(computeReceiptHash(receipt)).not.toBe(computeReceiptHash({ ...receipt, possibility_space: { ...space, worlds: [{ ...space.worlds![0], assumptions: ['changed'] }] } }));
  });
  it('does not count duplicate, model-only, qualification, or inconclusive relations as independent support', () => {
    const w = world('w1', 'ordinary reading'), c = claim(['w1']); const a = assessAllWorlds([w], [c], [relation('w1', 'supports', 'same'), { ...relation('w1', 'duplicates', 'same'), id: 'duplicate' }, { ...relation('w1', 'qualifies', 'other'), id: 'qualified' }, { ...relation('w1', 'inconclusive', 'third'), id: 'inconclusive' }, { ...relation('w1', 'supports', 'model'), id: 'model', provenance: { model: 'model-a' } }])[0];
    expect(a.independent_support_count).toBe(1); expect(a.qualified_claim_ids).toEqual(['claim-1']); expect(a.inconclusive_claim_ids).toEqual(['claim-1']);
  });
  it('caps worlds and returns a retrieval boundary for unresolved rival scenarios', () => {
    expect(() => buildPossibilitySpace({ input_summary: 'x', organization_id: 'o', program_id: 'p', program_version: '1', program_fingerprint: hash, worlds: Array.from({ length: 5 }, (_, i) => world(`w${i}`, `reading ${i}`)) })).toThrow('world count');
    const worlds = [world('a', 'date means authored'), world('b', 'date means published')], claims = [claim(['a', 'b'])], assessments = assessAllWorlds(worlds, claims, []), check = evaluateWorldDistinction(worlds, claims, assessments);
    expect(check.recommended_action).toBe('retrieve_more_evidence'); expect(check.next_information_needed).toContain('An official dated record');
  });
  it('measures genuine rival challenges and re-verification depth without assigning truth probability', () => {
    const history = claimRivalryHistory('claim-1', [
      { receipt_id: 'r1', assessed_at: '2026-01-01T00:00:00.000Z', program_fingerprint: 'program-a', considered_world_ids: ['ordinary'], rival_world_ids: [], outcome: 'survived', evidence_relation_ids: ['e1'] },
      { receipt_id: 'r2', assessed_at: '2026-02-01T00:00:00.000Z', program_fingerprint: 'program-a', considered_world_ids: ['ordinary', 'rival-a'], rival_world_ids: ['rival-a'], outcome: 'survived', evidence_relation_ids: ['e2'] },
      { receipt_id: 'r3', assessed_at: '2026-03-01T00:00:00.000Z', program_fingerprint: 'program-b', considered_world_ids: ['ordinary', 'rival-b'], rival_world_ids: ['rival-b'], outcome: 'unresolved', evidence_relation_ids: ['e3'] },
    ]);
    expect(history.re_verification_depth).toBe(2); expect(history.genuine_rivalry_count).toBe(2);
    expect(history.survived_rivalry_count).toBe(1); expect(history.stability_status).toBe('unresolved');
    expect(history.interpretation).toMatch(/not a probability/i);
    const receipt = buildReceipt({ task_id: 'history-1', input_hash: hash, output_hash: hash, score_bps: 7000, bundle_hash: hash, bundle_uri: 'ipfs://bundle', llm_provider: 'test', llm_model: 'test', claim_rivalry_history: [history] });
    expect(computeReceiptHash(receipt)).not.toBe(computeReceiptHash({ ...receipt, claim_rivalry_history: [{ ...history, genuine_rivalry_count: 99 }] }));
  });
});
