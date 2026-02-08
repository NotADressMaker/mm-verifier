import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import receiptSchemaV1 from './schemas/receipt.v1.schema.json';
import evidenceBundleSchemaV1 from './schemas/evidence_bundle.v1.schema.json';
import { validateReceipt as validateLegacyReceipt } from './receipt';

export type SchemaValidationError = {
  path: string;
  message: string;
  schemaVersion: 'v1';
};

export type SchemaValidationResult = {
  valid: boolean;
  errors: SchemaValidationError[];
};

export type VersionedSchemaValidationResult = {
  valid: boolean;
  errors: Array<SchemaValidationError | { path: string; message: string; schemaVersion: 'v0' }>;
  schemaVersion: 'v1' | 'v0';
};

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });

const receiptValidatorV1 = ajv.compile(receiptSchemaV1);
const evidenceBundleValidatorV1 = ajv.compile(evidenceBundleSchemaV1);

function formatErrors(errors: ErrorObject[] | null | undefined): SchemaValidationError[] {
  if (!errors) return [];
  return errors.map((error) => ({
    path: error.instancePath || '/',
    message: error.message || 'Schema validation error',
    schemaVersion: 'v1',
  }));
}

function runValidation(validator: ValidateFunction, payload: unknown): SchemaValidationResult {
  const valid = validator(payload) as boolean;
  return {
    valid,
    errors: valid ? [] : formatErrors(validator.errors),
  };
}

export function validateReceiptV1(payload: unknown): SchemaValidationResult {
  return runValidation(receiptValidatorV1, payload);
}

export function validateEvidenceBundleV1(payload: unknown): SchemaValidationResult {
  return runValidation(evidenceBundleValidatorV1, payload);
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
