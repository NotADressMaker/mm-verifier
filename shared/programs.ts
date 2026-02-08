/**
 * Program Fingerprinting and Metering for MMV "World Computer"
 *
 * Programs are deterministic verification workflows that can be registered,
 * fingerprinted, and metered. Each program has a unique fingerprint derived
 * from its canonical representation.
 */

import { hashCanonical, canonicalize } from './canonicalJson';
import {
  ProgramDefinition,
  ProgramStep,
  ProgramStepType,
  ProgramIO,
} from './httpSchemas';

// ============================================================================
// Metering Limits
// ============================================================================

/**
 * Resource limits for program execution (gas-like metering)
 */
export interface MeteringLimits {
  /** Maximum LLM calls allowed */
  max_llm_calls: number;
  /** Maximum total tokens (prompt + completion) */
  max_total_tokens: number;
  /** Maximum execution time in milliseconds */
  max_execution_ms: number;
  /** Maximum external retrieval calls */
  max_retrieval_calls?: number;
  /** Maximum evidence bundle size in bytes */
  max_bundle_size_bytes?: number;
}

/**
 * Default metering limits for programs
 */
export const DEFAULT_METERING_LIMITS: MeteringLimits = {
  max_llm_calls: 10,
  max_total_tokens: 100000,
  max_execution_ms: 300000, // 5 minutes
  max_retrieval_calls: 20,
  max_bundle_size_bytes: 5 * 1024 * 1024, // 5MB
};

// ============================================================================
// Extended Program Definition
// ============================================================================

/**
 * Extended program definition with metering limits
 */
export interface ProgramDefinitionWithLimits extends ProgramDefinition {
  /** Resource limits for execution */
  limits?: MeteringLimits;
  /** Schema version for fingerprinting */
  schema_version?: '1';
}

/**
 * A registered program with computed fingerprint
 */
export interface ProgramRecord {
  program_id: string;
  fingerprint: string;
  program: ProgramDefinitionWithLimits;
  created_at: string;
  registered_by?: string;
}

// ============================================================================
// Program Fingerprinting
// ============================================================================

/**
 * Fields to include in fingerprint calculation (order matters for determinism)
 */
const FINGERPRINT_FIELDS = [
  'name',
  'version',
  'description',
  'inputs',
  'outputs',
  'steps',
  'scoring',
  'thresholds',
  'receipt',
  'limits',
  'schema_version',
] as const;

/**
 * Normalize a program definition for fingerprinting.
 * Removes undefined fields and ensures consistent ordering.
 */
function normalizeProgramForFingerprint(
  program: ProgramDefinitionWithLimits
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const field of FINGERPRINT_FIELDS) {
    const value = program[field as keyof ProgramDefinitionWithLimits];
    if (value !== undefined) {
      if (field === 'steps') {
        // Normalize steps: ensure consistent step ordering and field presence
        normalized.steps = (value as ProgramStep[]).map((step) =>
          normalizeStep(step)
        );
      } else if (field === 'inputs' || field === 'outputs') {
        // Normalize IO definitions
        normalized[field] = (value as ProgramIO[]).map((io) => normalizeIO(io));
      } else if (field === 'limits') {
        // Normalize limits: only include defined fields
        normalized.limits = normalizeLimits(value as MeteringLimits);
      } else if (field === 'scoring') {
        normalized.scoring = normalizeScoring(value as ProgramDefinition['scoring']);
      } else if (field === 'thresholds') {
        normalized.thresholds = normalizeThresholds(value as ProgramDefinition['thresholds']);
      } else if (field === 'receipt') {
        normalized.receipt = normalizeReceipt(value as ProgramDefinition['receipt']);
      } else {
        normalized[field] = value;
      }
    }
  }

  // Always include schema_version for future-proofing
  if (!normalized.schema_version) {
    normalized.schema_version = '1';
  }

  return normalized;
}

function normalizeStep(step: ProgramStep): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    type: step.type,
  };

  if (step.id !== undefined) {
    normalized.id = step.id;
  }
  if (step.description !== undefined) {
    normalized.description = step.description;
  }
  if (step.config !== undefined && Object.keys(step.config).length > 0) {
    normalized.config = step.config;
  }

  return normalized;
}

function normalizeIO(io: ProgramIO): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    name: io.name,
    type: io.type,
  };

  if (io.description !== undefined) {
    normalized.description = io.description;
  }
  if (io.required !== undefined) {
    normalized.required = io.required;
  }

  return normalized;
}

function normalizeLimits(limits: MeteringLimits): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  if (limits.max_llm_calls !== undefined) {
    normalized.max_llm_calls = limits.max_llm_calls;
  }
  if (limits.max_total_tokens !== undefined) {
    normalized.max_total_tokens = limits.max_total_tokens;
  }
  if (limits.max_execution_ms !== undefined) {
    normalized.max_execution_ms = limits.max_execution_ms;
  }
  if (limits.max_retrieval_calls !== undefined) {
    normalized.max_retrieval_calls = limits.max_retrieval_calls;
  }
  if (limits.max_bundle_size_bytes !== undefined) {
    normalized.max_bundle_size_bytes = limits.max_bundle_size_bytes;
  }

  return normalized;
}

function normalizeScoring(scoring: ProgramDefinition['scoring']): Record<string, unknown> {
  return {
    method: scoring.method,
    components: scoring.components.map((component) => ({
      id: component.id,
      description: component.description,
      weight_bps: component.weight_bps,
    })),
  };
}

function normalizeThresholds(thresholds: ProgramDefinition['thresholds']): Record<string, unknown> {
  return {
    pass_bps: thresholds.pass_bps,
    worthy_bps: thresholds.worthy_bps,
  };
}

function normalizeReceipt(receipt: ProgramDefinition['receipt']): Record<string, unknown> {
  return {
    schema_version: receipt.schema_version,
    receipt_version: receipt.receipt_version,
    explain_version: receipt.explain_version,
  };
}

/**
 * Compute deterministic fingerprint for a program definition.
 * Uses canonical JSON serialization + keccak256.
 *
 * @param program - The program definition to fingerprint
 * @returns 0x-prefixed keccak256 hash
 */
export function computeProgramFingerprint(
  program: ProgramDefinitionWithLimits
): string {
  const normalized = normalizeProgramForFingerprint(program);
  return hashCanonical(normalized);
}

/**
 * Get the canonical JSON representation of a program (for debugging/verification)
 */
export function getProgramCanonicalJson(
  program: ProgramDefinitionWithLimits
): string {
  const normalized = normalizeProgramForFingerprint(program);
  return canonicalize(normalized);
}

/**
 * Verify that two programs have the same fingerprint
 */
export function programsMatch(
  a: ProgramDefinitionWithLimits,
  b: ProgramDefinitionWithLimits
): boolean {
  return computeProgramFingerprint(a) === computeProgramFingerprint(b);
}

// ============================================================================
// Program Validation
// ============================================================================

export interface ProgramValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_STEP_TYPES: ProgramStepType[] = [
  'prompt',
  'retrieve',
  'cross-check',
  'score',
  'evidence',
  'consensus',
];

/**
 * Validate a program definition
 */
export function validateProgram(
  program: unknown
): ProgramValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!program || typeof program !== 'object') {
    return { valid: false, errors: ['Program must be an object'], warnings };
  }

  const p = program as Record<string, unknown>;

  // Required fields
  if (typeof p.name !== 'string' || p.name.length === 0) {
    errors.push('name is required and must be a non-empty string');
  }

  if (typeof p.version !== 'string' || p.version.length === 0) {
    errors.push('version is required and must be a non-empty string');
  }

  // Steps validation
  if (!Array.isArray(p.steps)) {
    errors.push('steps must be an array');
  } else if (p.steps.length === 0) {
    errors.push('steps must contain at least one step');
  } else {
    for (let i = 0; i < p.steps.length; i++) {
      const step = p.steps[i] as Record<string, unknown>;
      if (!step || typeof step !== 'object') {
        errors.push(`steps[${i}] must be an object`);
        continue;
      }

      if (!VALID_STEP_TYPES.includes(step.type as ProgramStepType)) {
        errors.push(
          `steps[${i}].type must be one of: ${VALID_STEP_TYPES.join(', ')}`
        );
      }
    }
  }

  // Scoring validation
  if (!p.scoring || typeof p.scoring !== 'object') {
    errors.push('scoring is required and must be an object');
  } else {
    const scoring = p.scoring as Record<string, unknown>;
    if (scoring.method !== 'weighted_sum') {
      errors.push('scoring.method must be "weighted_sum"');
    }
    if (!Array.isArray(scoring.components) || scoring.components.length === 0) {
      errors.push('scoring.components must be a non-empty array');
    } else {
      scoring.components.forEach((component, index) => {
        const value = component as Record<string, unknown>;
        if (typeof value.id !== 'string' || value.id.length === 0) {
          errors.push(`scoring.components[${index}].id is required`);
        }
        if (
          typeof value.weight_bps !== 'number' ||
          value.weight_bps < 0 ||
          value.weight_bps > 10000
        ) {
          errors.push(`scoring.components[${index}].weight_bps must be between 0 and 10000`);
        }
      });
    }
  }

  // Threshold validation
  if (!p.thresholds || typeof p.thresholds !== 'object') {
    errors.push('thresholds is required and must be an object');
  } else {
    const thresholds = p.thresholds as Record<string, unknown>;
    if (
      typeof thresholds.pass_bps !== 'number' ||
      thresholds.pass_bps < 0 ||
      thresholds.pass_bps > 10000
    ) {
      errors.push('thresholds.pass_bps must be between 0 and 10000');
    }
    if (
      typeof thresholds.worthy_bps !== 'number' ||
      thresholds.worthy_bps < 0 ||
      thresholds.worthy_bps > 10000
    ) {
      errors.push('thresholds.worthy_bps must be between 0 and 10000');
    }
  }

  // Receipt definition validation
  if (!p.receipt || typeof p.receipt !== 'object') {
    errors.push('receipt is required and must be an object');
  } else {
    const receipt = p.receipt as Record<string, unknown>;
    if (receipt.schema_version !== '1') {
      errors.push('receipt.schema_version must be "1"');
    }
    if (typeof receipt.receipt_version !== 'string' || receipt.receipt_version.length === 0) {
      errors.push('receipt.receipt_version is required');
    }
    if (typeof receipt.explain_version !== 'string' || receipt.explain_version.length === 0) {
      errors.push('receipt.explain_version is required');
    }
  }

  // Limits validation (optional)
  if (p.limits !== undefined) {
    if (typeof p.limits !== 'object') {
      errors.push('limits must be an object');
    } else {
      const limits = p.limits as Record<string, unknown>;

      if (limits.max_llm_calls !== undefined) {
        if (
          typeof limits.max_llm_calls !== 'number' ||
          limits.max_llm_calls < 1
        ) {
          errors.push('limits.max_llm_calls must be a positive integer');
        }
      }

      if (limits.max_total_tokens !== undefined) {
        if (
          typeof limits.max_total_tokens !== 'number' ||
          limits.max_total_tokens < 1
        ) {
          errors.push('limits.max_total_tokens must be a positive integer');
        }
      }

      if (limits.max_execution_ms !== undefined) {
        if (
          typeof limits.max_execution_ms !== 'number' ||
          limits.max_execution_ms < 1000
        ) {
          errors.push('limits.max_execution_ms must be at least 1000');
        }
      }
    }
  }

  // Warnings
  if (p.description === undefined) {
    warnings.push('description is recommended for program documentation');
  }

  if (p.limits === undefined) {
    warnings.push(
      'limits not specified, default metering limits will be applied'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a value is a valid ProgramDefinitionWithLimits
 */
export function isProgramDefinition(
  value: unknown
): value is ProgramDefinitionWithLimits {
  return validateProgram(value).valid;
}

// ============================================================================
// Program ID Generation
// ============================================================================

/**
 * Generate a short program ID from a fingerprint
 * Format: first 8 hex characters of fingerprint
 */
export function generateProgramId(fingerprint: string): string {
  // Remove 0x prefix and take first 8 chars
  const hash = fingerprint.startsWith('0x') ? fingerprint.slice(2) : fingerprint;
  return `prog_${hash.slice(0, 8)}`;
}

/**
 * Create a ProgramRecord from a program definition
 */
export function createProgramRecord(
  program: ProgramDefinitionWithLimits,
  registeredBy?: string
): ProgramRecord {
  const fingerprint = computeProgramFingerprint(program);
  const programId = generateProgramId(fingerprint);

  return {
    program_id: programId,
    fingerprint,
    program,
    created_at: new Date().toISOString(),
    registered_by: registeredBy,
  };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type { ProgramDefinition, ProgramStep, ProgramStepType, ProgramIO };
