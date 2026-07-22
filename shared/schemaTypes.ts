/**
 * Canonical schema types derived from shared JSON schemas.
 *
 * Keep these exports aligned with shared/schemas/*.schema.json.
 */

export {
  RECEIPT_SCHEMA_VERSION,
  RECEIPT_VERSION,
  EXPLAIN_VERSION,
  ReceiptExplain,
  VerificationReceipt,
} from './receipt';
export {
  EvidenceBundle,
  EvidenceBundleV01,
  EvidenceBundleV02,
  EvidenceBundleV03,
  EvidenceBundleVersion,
} from './types';
export type { AllusionAssessment, AllusionCandidate, AllusionDeliberation, AllusionOptions, AllusionType, AllusionVerification } from './allusions';
