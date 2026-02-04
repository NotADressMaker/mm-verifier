import { hashCanonical, hashUtf8 } from '../../../shared/canonicalJson';

export function hashOutput(output: string): string {
  return hashUtf8(output);
}

export function hashDetails(details: unknown): string {
  return hashCanonical(details);
}
