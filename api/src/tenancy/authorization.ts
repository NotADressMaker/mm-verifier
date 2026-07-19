export const ORGANIZATION_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type OrganizationContext = { organizationId: string; userId?: string; role?: OrganizationRole; authType: 'session' | 'api-key' | 'wallet' | 'internal'; scopes?: string[] };

export const permissions = {
  manageOrganization: ['owner'], manageMembers: ['owner', 'admin'], manageSettings: ['owner', 'admin'],
  manageApiKeys: ['owner', 'admin'], createVerification: ['owner', 'admin', 'member'],
  writeReceipts: ['owner', 'admin', 'member'], readResources: ['owner', 'admin', 'member', 'viewer'],
} as const satisfies Record<string, readonly OrganizationRole[]>;

export function can(role: OrganizationRole | undefined, permission: keyof typeof permissions): boolean {
  return !!role && permissions[permission].includes(role);
}
export function requireOrganizationRole(context: OrganizationContext, permission: keyof typeof permissions): void {
  if (!can(context.role, permission)) { const error = new Error('Forbidden'); (error as Error & { status: number }).status = 403; throw error; }
}
export function assertOrganizationResource(context: OrganizationContext, organizationId: string): void {
  if (context.organizationId !== organizationId) { const error = new Error('Not Found'); (error as Error & { status: number }).status = 404; throw error; }
}
