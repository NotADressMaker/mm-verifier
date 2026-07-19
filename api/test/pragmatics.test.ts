import { classifyStatementType, extractStatements, pragmaticsBoundaries } from '../src/services/statementTypeService';
import { checkReferenceConsistency, referenceConsistencyBoundaries } from '../src/services/referenceConsistencyService';
import { describe, expect, it } from '@jest/globals';

describe('statement handling', () => {
  it('keeps ordinary factual text as a high-confidence assertion without an implied statement', () => {
    const [claim] = extractStatements('Paris is the capital of France.');
    expect(claim.statement_type.statement_type).toBe('assertion'); expect(claim.statement_type.confidence).toBeGreaterThan(.8); expect(claim.content.implied_content).toBeUndefined();
  });
  it('marks quotations and conditionals without asserting a conditional antecedent', () => {
    expect(classifyStatementType('Ada said "the launch succeeded".').statement_type).toBe('quotation');
    const [conditional] = extractStatements('If the launch succeeded, the team celebrates.');
    expect(conditional.statement_type.statement_type).toBe('hypothetical'); expect(conditional.content.literal_content).toContain('If');
  });
  it('creates independent hedge disclosure, hedged-content, and scalar implied records', () => {
    const hedge = extractStatements('It is possible that the service is down.');
    expect(hedge.map(x => x.role)).toEqual(['literal', 'hedge_disclosure', 'hedged_content']);
    const some = extractStatements('Some employees are laid off.');
    expect(some.find(x => x.role === 'implied')?.content).toMatchObject({ literal_content: 'Not all employees are laid off.', implication_basis: 'scalar' });
  });
  it('records a boundary instead of silently deciding unclear statement types', () => {
    const uncertain = classifyStatementType('Yeah, right, that will work.');
    expect(pragmaticsBoundaries('c1', uncertain)[0]).toMatchObject({ code: 'STATEMENT_TYPE_UNCERTAIN', affected_claim_ids: ['c1'] });
  });
});

describe('reference consistency', () => {
  it('does not merge repeated names without distinguishing evidence', () => {
    const checks = checkReferenceConsistency([{ id: 'a', text: 'Alex Smith joined the company.' }, { id: 'b', text: 'Alex Smith won the election.' }]);
    expect(checks[0]).toMatchObject({ reference_text: 'Alex Smith', status: 'ambiguous' });
    expect(referenceConsistencyBoundaries(checks)[0].code).toBe('REFERENCE_AMBIGUOUS');
  });
});
