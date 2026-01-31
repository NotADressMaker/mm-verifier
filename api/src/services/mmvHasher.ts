import { keccak256, toUtf8Bytes } from 'ethers';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return Object.fromEntries(entries.map(([key, val]) => [key, sortKeys(val)]));
  }

  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashUtf8(value: string): string {
  return keccak256(toUtf8Bytes(value));
}

export function hashCanonical(value: unknown): string {
  return hashUtf8(canonicalize(value));
}

export function normalizeBytes32(value: string): string {
  if (value.startsWith('0x') && value.length === 66) {
    return value;
  }
  return hashUtf8(value);
}
