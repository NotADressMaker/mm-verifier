import { describe, expect, it } from '@jest/globals';
import { validateEducationRequest } from '../../shared/education/schemas';
import { aggregateClaims, supportLevelForScore } from '../../shared/education/scoring';
import { verifyEducation } from '../src/services/educationVerification';
const request = { mode: 'student_answer' as const, question: 'Why?', content: "Earth's axial tilt causes seasons.", subject: 'earth-science', education_level: 'middle-school' as const, content_type: 'answer', privacy_acknowledged: true as const };
describe('education MVP', () => {
 it('validates request and requires privacy acknowledgement', () => { expect(validateEducationRequest(request).errors).toEqual([]); expect(validateEducationRequest({ ...request, privacy_acknowledged: false }).errors[0].field).toBe('privacy_acknowledged'); });
 it('maps configurable MVP scores deterministically', () => { expect(supportLevelForScore(.9)).toBe('strongly_supported'); expect(supportLevelForScore(.3)).toBe('weakly_supported'); });
 it('returns deterministic ephemeral receipt and citation warning', () => { const first = verifyEducation({ ...request, content: 'Earth is flat. See https://example.com.' }); const second = verifyEducation({ ...request, content: 'Earth is flat. See https://example.com.' }); expect(first.task_id).toBe(second.task_id); expect(first.receipt.education.raw_content_persisted).toBe(false); expect(first.education_result.citation_review.warnings).not.toHaveLength(0); });
 it('aggregates claim scores', () => { expect(aggregateClaims([{ id: '1', text: 'x', classification: 'supported', confidence: 1, explanation: '', evidence: [], warnings: [] }])).toBe(1); });
});
