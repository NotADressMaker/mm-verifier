import crypto from 'crypto';
export const API_KEY_SCOPES = ['receipts:read', 'receipts:write', 'verifications:create', 'projects:read', 'projects:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
export function hashApiKey(key: string): string { return crypto.createHash('sha256').update(key).digest('hex'); }
export function createApiKeyMaterial(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `mamv_${crypto.randomBytes(32).toString('base64url')}`;
  return { plaintext, prefix: plaintext.slice(0, 12), hash: hashApiKey(plaintext) };
}
export function apiKeyIsUsable(key: { revokedAt: Date | null; expiresAt: Date | null }): boolean { return !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date()); }
