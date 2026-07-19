import { can, assertOrganizationResource, requireOrganizationRole } from '../src/tenancy/authorization';
import { apiKeyIsUsable, createApiKeyMaterial, hashApiKey } from '../src/tenancy/apiKeys';

describe('organization isolation primitives', () => {
  const alpha = { organizationId: 'alpha', userId: 'user', role: 'owner' as const, authType: 'session' as const };
  it('does not permit a tenant context to address another tenant resource', () => {
    expect(() => assertOrganizationResource(alpha, 'beta')).toThrow('Not Found');
  });
  it('centralizes the viewer and member permission boundary', () => {
    expect(can('viewer', 'createVerification')).toBe(false);
    expect(() => requireOrganizationRole({ ...alpha, role: 'member' }, 'manageOrganization')).toThrow('Forbidden');
    expect(can('owner', 'manageSettings')).toBe(true);
  });
  it('hashes API keys and rejects revoked and expired keys', () => {
    const material = createApiKeyMaterial();
    expect(material.hash).toBe(hashApiKey(material.plaintext));
    expect(material.hash).not.toContain(material.plaintext);
    expect(apiKeyIsUsable({ revokedAt: new Date(), expiresAt: null })).toBe(false);
    expect(apiKeyIsUsable({ revokedAt: null, expiresAt: new Date(0) })).toBe(false);
  });
});
