import { detectAllusions, consensusConfidence, verifyAllusions, validateAllusionAssessment } from '../../shared/allusions';

describe('allusion analysis', () => {
  const options = { enabled: true, minimum_detection_confidence: .5 };
  it.each([
    ['The company crossed the Rubicon.', 'historical'],
    ['The release opened Pandora’s box.', 'mythological'],
    ['The new monitoring system feels like Big Brother.', 'literary'],
    ['It was a David-and-Goliath contest.', 'religious'],
  ])('detects %s', (text, type) => expect(detectAllusions({ text, options })[0]).toMatchObject({ type }));
  it('preserves Trojan horse ambiguity but rejects literal usage', () => {
    expect(detectAllusions({ text: 'The plugin was a Trojan horse.', options })[0]).toMatchObject({ type: 'idiomatic', possible_types: ['idiomatic', 'mythological'] });
    expect(detectAllusions({ text: 'The museum displayed a wooden Trojan horse.', options })).toEqual([]);
  });
  it('keeps Kantian attribution ambiguous and validates confidence', () => {
    expect(detectAllusions({ text: 'Every judgment must be universally communicable.', options })[0]).toMatchObject({ type: 'philosophical', explicitness: 'ambiguous' });
    expect(validateAllusionAssessment({ candidates: [{ allusion_id: 'x', text_span: 'x', type: 'unknown', explicitness: 'ambiguous', interpretation: 'x', confidence: 2, context_sensitive: false, alternative_interpretations: [], evidence_ids: [], warnings: [] }], verifications: [], overall_warnings: [] })).toHaveLength(1);
  });
  it('treats consensus separately from evidence', () => {
    const candidates = detectAllusions({ text: 'The company crossed the Rubicon.', options });
    expect(consensusConfidence([...candidates, { ...candidates[0] }])).toBe(1);
    expect(verifyAllusions(candidates)).toMatchObject([{ status: 'not_enough_information' }]);
  });
});
