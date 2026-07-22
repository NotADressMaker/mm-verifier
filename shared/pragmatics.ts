import type { VerificationBoundary } from './receipt';
export { detectAllusions, isDirectQuotation, isLikelyAllusion, isLiteralUsage, isParaphraseCandidate, requiresContextForInterpretation } from './allusions';
export type { AllusionAssessment, AllusionCandidate, AllusionDeliberation, AllusionOptions, AllusionType, AllusionVerification } from './allusions';

/** The minimum confidence required before automated statement/reference handling is decisive. */
export const PRAGMATICS_CONFIDENCE_THRESHOLD = 0.8;
export type StatementType = 'assertion' | 'hedge' | 'hypothetical' | 'rhetorical_question' | 'quotation' | 'figurative' | 'sincerity_unclear';
export interface StatementTypeClassification { statement_type: StatementType; confidence: number; rationale: string; triggering_span?: { start: number; end: number }; }
export interface ClaimContent { literal_content: string; implied_content?: string; implication_basis?: 'scalar' | 'conversational' | 'conventional' | 'none'; implication_confidence?: number; }
export interface ReferenceConsistencyCheck { reference_text: string; claim_ids: string[]; status: 'consistent' | 'ambiguous' | 'conflicting' | 'unresolved'; distinguishing_evidence?: string; explanation: string; }

const span = (text: string, match: RegExpMatchArray) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
/** A deliberately conservative deterministic baseline; model classifiers may replace this result. */
export function classifyStatementType(text: string): StatementTypeClassification {
  const quote = text.match(/[“"]([^”"]+)[”"]/);
  if (quote) return { statement_type: 'quotation', confidence: .98, rationale: 'The statement contains an explicit quoted span; verify the representation of that source.', triggering_span: span(text, quote) };
  const conditional = text.match(/^\s*(if|assuming|suppose)\b/i);
  if (conditional) return { statement_type: 'hypothetical', confidence: .96, rationale: 'The statement is explicitly conditional and does not assert its antecedent.', triggering_span: span(text, conditional) };
  const hedge = text.match(/\b(it is |it'?s )?(possible|may|might|perhaps)\b|\bsome sources (suggest|say)\b/i);
  if (hedge) return { statement_type: 'hedge', confidence: .94, rationale: 'The statement explicitly discloses uncertainty.', triggering_span: span(text, hedge) };
  if (/\?\s*$/.test(text) && /\b(who|what|why|how|isn'?t|aren'?t|doesn'?t|wouldn'?t)\b/i.test(text)) return { statement_type: 'rhetorical_question', confidence: .72, rationale: 'The question may be rhetorical; a literal reading is not reliable without context.' };
  if (/\b(as if|yeah,? right|what a surprise)\b/i.test(text)) return { statement_type: 'sincerity_unclear', confidence: .65, rationale: 'The wording can be sincere or ironic without conversational context.' };
  return { statement_type: 'assertion', confidence: .99, rationale: 'No clear non-assertive marker was found.' };
}

export function contentForStatement(text: string): ClaimContent {
  const literal_content = text.trim();
  const some = literal_content.match(/^some\s+(.+?)\s+are\s+(.+?)[.!?]?$/i);
  if (some) return { literal_content, implied_content: `Not all ${some[1]} are ${some[2]}.`, implication_basis: 'scalar', implication_confidence: .9 };
  return { literal_content, implication_basis: 'none' };
}

export interface ExtractedStatement { id: string; original_text: string; content: ClaimContent; statement_type: StatementTypeClassification; role: 'literal' | 'implied' | 'hedge_disclosure' | 'hedged_content'; parent_claim_id?: string; }
/** Splits material implied and hedge-disclosure content into independently verifiable records. */
export function extractStatements(text: string, idPrefix = 'claim'): ExtractedStatement[] {
  return text.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean).flatMap((original_text, index) => {
    const id = `${idPrefix}-${index + 1}`, statement_type = classifyStatementType(original_text), content = contentForStatement(original_text);
    const result: ExtractedStatement[] = [{ id, original_text, content, statement_type, role: 'literal' }];
    if (statement_type.statement_type === 'hedge') {
      const hedged = original_text.replace(/^(it is |it'?s )?possible that\s*|^some sources (suggest|say)\s*/i, '').trim();
      result.push({ id: `${id}-hedge`, original_text, content: { literal_content: 'The answer disclosed uncertainty about this statement.', implication_basis: 'none' }, statement_type, role: 'hedge_disclosure', parent_claim_id: id });
      result.push({ id: `${id}-content`, original_text: hedged, content: { literal_content: hedged, implication_basis: 'none' }, statement_type: { ...statement_type, statement_type: 'assertion', rationale: 'Content separated from its uncertainty disclosure.' }, role: 'hedged_content', parent_claim_id: id });
    }
    if (content.implied_content) result.push({ id: `${id}-implied`, original_text: content.implied_content, content: { literal_content: content.implied_content, implication_basis: content.implication_basis, implication_confidence: content.implication_confidence }, statement_type: { statement_type: 'assertion', confidence: content.implication_confidence ?? .8, rationale: `Separate ${content.implication_basis} implied statement.` }, role: 'implied', parent_claim_id: id });
    return result;
  });
}

export function pragmaticsBoundaries(claimId: string, classification: StatementTypeClassification): VerificationBoundary[] {
  if (classification.confidence >= PRAGMATICS_CONFIDENCE_THRESHOLD && !['rhetorical_question', 'figurative', 'sincerity_unclear'].includes(classification.statement_type)) return [];
  return [{ code: 'STATEMENT_TYPE_UNCERTAIN', affected_claim_ids: [claimId], explanation: classification.rationale, required_next_information: ['Provide surrounding context or a clearly intended literal statement.'] }];
}

/** Checks repeated capitalized names conservatively: equal spelling alone is ambiguous. */
export function checkReferenceConsistency(claims: Array<{ id: string; text: string }>): ReferenceConsistencyCheck[] {
  const groups = new Map<string, Array<{ id: string; text: string }>>();
  for (const claim of claims) for (const name of claim.text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? []) groups.set(name, [...(groups.get(name) ?? []), claim]);
  return [...groups.entries()].filter(([, mentions]) => mentions.length > 1).map(([reference_text, mentions]) => ({ reference_text, claim_ids: mentions.map(x => x.id), status: 'ambiguous', explanation: `“${reference_text}” appears in multiple claims without distinguishing dates, affiliations, or locations.` }));
}
