/**
 * @mmv/genail-integration
 *
 * GenAI Language integration for MMV verification with metering,
 * receipts, and auditable evidence.
 *
 * @example
 * ```typescript
 * import { createVerifiedRuntime, executeGenAIL } from '@mmv/genail-integration';
 *
 * // Create a runtime with MMV verification
 * const runtime = createVerifiedRuntime('https://api.mmv.io', 'your-api-key');
 *
 * // Execute a GenAIL script
 * const result = await runtime.execute(`
 *   model "gpt-4"
 *   set task = $input.question
 *   message system "You are a helpful assistant."
 *   message user task
 *   generate as answer
 * `, { question: 'What is 2+2?' });
 *
 * // Access the verification receipt
 * console.log(result.receipt);
 *
 * // Access the evidence bundle
 * console.log(result.evidence);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Metering types
  MeteringState,
  MeteringLimits,
  MeteringCheckResult,
  MeteringCallLog,

  // Program types
  GenAILProgram,
  GenAILProgramMetadata,
  GenAILAST,
  GenAILASTNode,

  // Execution types
  MMVExecutionContext,
  MMVExecutionResult,
  ModelCallRecord,
  MMVConfig,

  // Receipt types
  GenAILVerificationReceipt,

  // Evidence types
  GenAILEvidenceBundle,
  EvidenceExportOptions,

  // Hook types
  GenAILRuntimeHooks,

  // Config types
  MMVGenAILConfig,
} from './types';

// ============================================================================
// Metering
// ============================================================================

export {
  // State management
  createMeteringState,
  finalizeMeteringState,
  recordLLMCall,
  recordToolCall,

  // Limit checking
  DEFAULT_METERING_LIMITS,
  checkMeteringLimits,
  enforceMeteringLimits,
  MeteringLimitExceededError,

  // Call recording
  generateCallId,
  computeContentHash,
  computeModelCommitmentHash,
  createModelCallRecord,

  // Hooks
  createMeteringHooks,

  // Utilities
  generateMeteringSummary,
} from './metering';

// ============================================================================
// Receipts
// ============================================================================

export {
  // Hash computation
  computeInputHash,
  computeOutputHash,
  computeProgramFingerprint,

  // Receipt generation
  generateExecutionId,
  buildReceipt,
  computeReceiptHash,

  // Validation
  validateReceiptIntegrity,
  validateReceiptAgainstContext,

  // MMV integration
  submitForVerification,
  waitForVerification,

  // Serialization
  serializeReceipt,
  deserializeReceipt,
  formatReceiptSummary,
} from './receipt';

// ============================================================================
// Evidence
// ============================================================================

export {
  // Source handling
  normalizeSource,
  computeSourceHash,

  // Program parsing
  extractProgramMetadata,
  parseGenAILProgram,

  // Bundle generation
  DEFAULT_EVIDENCE_OPTIONS,
  buildEvidenceBundle,
  signEvidenceBundle,

  // Validation
  validateEvidenceIntegrity,
  validateEvidenceAgainstContext,

  // Storage
  serializeEvidence,
  deserializeEvidence,
  storeEvidence,

  // Utilities
  formatEvidenceSummary,
} from './evidence';

// ============================================================================
// Runtime
// ============================================================================

export {
  // Configuration
  DEFAULT_CONFIG,

  // Context management
  createExecutionContext,

  // Runtime class
  MMVGenAILRuntime,

  // Factory functions
  createRuntime,
  createVerifiedRuntime,

  // Convenience functions
  executeGenAIL,
  executeAndGetReceipt,
  validateAndFingerprint,
} from './runtime';
