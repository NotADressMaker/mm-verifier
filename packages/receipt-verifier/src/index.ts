export type {
  EvidenceBundle,
  ReceiptExplain,
  VerificationReceipt,
} from '../../../shared/schemaTypes';

export const RECEIPT_SCHEMA_VERSION = '1' as const;
export const BUNDLE_SCHEMA_VERSION = '1' as const;
export const RECEIPT_VERSION = '1.0.0' as const;

export type ReceiptVerificationResult = {
  valid: boolean;
  errors: string[];
  schemaCompatible: boolean;
};

const HASH_32_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function isSchemaVersionCompatible(value: unknown, expected: string): boolean {
  return value === expected;
}

export function verifyReceiptSchema(receipt: unknown): ReceiptVerificationResult {
  const errors: string[] = [];

  if (!receipt || typeof receipt !== 'object') {
    return { valid: false, errors: ['Receipt must be an object'], schemaCompatible: false };
  }

  const r = receipt as Record<string, unknown>;
  const schemaCompatible = isSchemaVersionCompatible(r.schema_version, RECEIPT_SCHEMA_VERSION);

  if (!schemaCompatible) {
    errors.push(`schema_version must be "${RECEIPT_SCHEMA_VERSION}"`);
  }

  if (r.version !== RECEIPT_VERSION) {
    errors.push(`version must be "${RECEIPT_VERSION}"`);
  }

  if (r.receipt_version !== RECEIPT_VERSION) {
    errors.push(`receipt_version must be "${RECEIPT_VERSION}"`);
  }

  if (typeof r.task_id !== 'string' || r.task_id.length === 0) {
    errors.push('task_id is required');
  }

  if (typeof r.generated_at !== 'number' || r.generated_at <= 0) {
    errors.push('generated_at must be a positive unix timestamp');
  }

  for (const field of ['input_hash', 'output_hash'] as const) {
    const value = r[field];
    if (typeof value !== 'string' || !HASH_32_REGEX.test(value)) {
      errors.push(`${field} must be a 0x-prefixed 32-byte hex string`);
    }
  }

  if (typeof r.score_bps !== 'number' || r.score_bps < 0 || r.score_bps > 10000) {
    errors.push('score_bps must be between 0 and 10000');
  }

  if (typeof r.verdict !== 'boolean') {
    errors.push('verdict must be a boolean');
  }

  if (typeof r.worthy !== 'boolean') {
    errors.push('worthy must be a boolean');
  }

  if (!r.evidence || typeof r.evidence !== 'object') {
    errors.push('evidence is required');
  } else {
    const evidence = r.evidence as Record<string, unknown>;
    if (typeof evidence.bundle_hash !== 'string' || !HASH_32_REGEX.test(evidence.bundle_hash)) {
      errors.push('evidence.bundle_hash must be a 0x-prefixed 32-byte hex string');
    }
    if (typeof evidence.bundle_uri !== 'string' || evidence.bundle_uri.length === 0) {
      errors.push('evidence.bundle_uri is required');
    }
    if (!['0.1', '0.2', '0.3'].includes(evidence.bundle_version as string)) {
      errors.push('evidence.bundle_version must be 0.1, 0.2, or 0.3');
    }
  }

  if (!r.provenance || typeof r.provenance !== 'object') {
    errors.push('provenance is required');
  } else {
    const provenance = r.provenance as Record<string, unknown>;
    if (typeof provenance.llm_provider !== 'string' || provenance.llm_provider.length === 0) {
      errors.push('provenance.llm_provider is required');
    }
    if (typeof provenance.llm_model !== 'string' || provenance.llm_model.length === 0) {
      errors.push('provenance.llm_model is required');
    }
  }

  if (!r.explain || typeof r.explain !== 'object') {
    errors.push('explain is required');
  }

  if (r.program !== undefined) {
    const program = r.program as Record<string, unknown>;
    if (typeof program.id !== 'string') {
      errors.push('program.id is required');
    }
    if (typeof program.version !== 'string') {
      errors.push('program.version is required');
    }
    if (typeof program.hash !== 'string') {
      errors.push('program.hash is required');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    schemaCompatible,
  };
}
