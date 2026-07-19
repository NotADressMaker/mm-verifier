/** API-facing entry point for the shared statement classification pipeline. */
export { PRAGMATICS_CONFIDENCE_THRESHOLD, classifyStatementType, contentForStatement, extractStatements, pragmaticsBoundaries } from '../../../shared/pragmatics';
export type { StatementType, StatementTypeClassification, ClaimContent, ExtractedStatement } from '../../../shared/pragmatics';
