/** API-facing entry point for the shared statement classification pipeline. */
export { PRAGMATICS_CONFIDENCE_THRESHOLD, classifyStatementType, contentForStatement, extractStatements, pragmaticsBoundaries } from '../../../shared/pragmatics';
export type { StatementType, StatementTypeClassification, ClaimContent, ExtractedStatement } from '../../../shared/pragmatics';
export { detectAllusions, isDirectQuotation, isLikelyAllusion, isLiteralUsage, isParaphraseCandidate, requiresContextForInterpretation } from '../../../shared/pragmatics';
export type { AllusionAssessment, AllusionCandidate, AllusionDeliberation, AllusionOptions, AllusionType, AllusionVerification } from '../../../shared/pragmatics';
