import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import receiptSchemaV1 from './schemas/receipt.v1.schema.json';
import evidenceBundleSchemaV1 from './schemas/evidence_bundle.v1.schema.json';
import evidenceBundleSchemaV2 from './schemas/evidence_bundle.v2.schema.json';
import { validateReceipt as validateLegacyReceipt } from './receipt';

export type SchemaValidationError = {
  path: string;
  message: string;
  schemaVersion: 'v1' | 'v2';
};

export type SchemaValidationResult = {
  valid: boolean;
  errors: SchemaValidationError[];
};

export type VersionedSchemaValidationResult = {
  valid: boolean;
  errors: Array<SchemaValidationError | { path: string; message: string; schemaVersion: 'v0' }>;
  schemaVersion: 'v2' | 'v1' | 'v0';
};

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  strictRequired: false,
});

const receiptValidatorV1 = ajv.compile(receiptSchemaV1);
const evidenceBundleValidatorV1 = ajv.compile(evidenceBundleSchemaV1);
const evidenceBundleValidatorV2 = ajv.compile(evidenceBundleSchemaV2);

function formatErrors(
  errors: ErrorObject[] | null | undefined,
  schemaVersion: SchemaValidationError['schemaVersion']
): SchemaValidationError[] {
  if (!errors) return [];
  return errors.map((error) => ({
    path: error.instancePath || '/',
    message: error.message || 'Schema validation error',
    schemaVersion,
  }));
}

function runValidation(
  validator: ValidateFunction,
  payload: unknown,
  schemaVersion: SchemaValidationError['schemaVersion']
): SchemaValidationResult {
  const valid = validator(payload) as boolean;
  return {
    valid,
    errors: valid ? [] : formatErrors(validator.errors, schemaVersion),
  };
}

export function validateReceiptV1(payload: unknown): SchemaValidationResult {
  return runValidation(receiptValidatorV1, payload, 'v1');
}

export function validateEvidenceBundleV1(payload: unknown): SchemaValidationResult {
  return runValidation(evidenceBundleValidatorV1, payload, 'v1');
}

export function validateEvidenceBundleV2(payload: unknown): SchemaValidationResult {
  return runValidation(evidenceBundleValidatorV2, payload, 'v2');
}

export function validateEvidenceBundlePayload(payload: unknown): VersionedSchemaValidationResult {
  const version = (payload as { version?: string })?.version;
  if (version === '1.0.0') {
    const result = validateEvidenceBundleV1(payload);
    return { ...result, schemaVersion: 'v1' };
  }

  const result = validateEvidenceBundleV2(payload);
  return { ...result, schemaVersion: 'v2' };
}

export function validateReceiptPayload(payload: unknown): VersionedSchemaValidationResult {
  const version = (payload as { receipt_version?: string })?.receipt_version;
  if (version === '1.0') {
    const legacy = validateLegacyReceipt(payload);
    return {
      valid: legacy.valid,
      errors: legacy.errors.map((message) => ({
        path: '/',
        message,
        schemaVersion: 'v0',
      })),
      schemaVersion: 'v0',
    };
  }

  const result = validateReceiptV1(payload);
  return {
    ...result,
    schemaVersion: 'v1',
  };
}
