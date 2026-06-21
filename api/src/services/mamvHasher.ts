import { canonicalize, hashCanonical, hashUtf8 } from '../../../shared/canonicalJson';

export function normalizeBytes32(value: string): string {
  if (value.startsWith('0x') && value.length === 66) {
    return value;
  }
  return hashUtf8(value);
}

export { canonicalize, hashCanonical, hashUtf8 };
