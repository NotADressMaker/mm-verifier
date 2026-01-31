import { keccak256, toUtf8Bytes } from 'ethers';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizeValue(value: unknown): JsonValue {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    const normalized: Record<string, JsonValue> = {};
    for (const [key, entryValue] of entries) {
      normalized[key] = normalizeValue(entryValue);
    }
    return normalized;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throw new Error(`Unsupported canonical JSON type: ${typeof value}`);
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export function hashUtf8(value: string): string {
  return keccak256(toUtf8Bytes(value));
}

export function hashCanonical(value: unknown): string {
  return hashUtf8(canonicalize(value));
}
