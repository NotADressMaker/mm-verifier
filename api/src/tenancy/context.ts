import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { hashApiKey, apiKeyIsUsable } from './apiKeys';
import { OrganizationContext, OrganizationRole } from './authorization';
const prisma = new PrismaClient();
export type TenantRequest = Request & { organizationContext?: OrganizationContext };

export async function resolveOrganizationContext(req: Request): Promise<OrganizationContext | null> {
  const bearer = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!bearer) return null;
  if (bearer.startsWith('mamv_')) {
    const key = await prisma.organizationApiKey.findUnique({ where: { keyHash: hashApiKey(bearer) } });
    if (!key || !apiKeyIsUsable(key)) return null;
    await prisma.organizationApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return { organizationId: key.organizationId, authType: 'api-key', scopes: key.scopes };
  }
  try {
    const claims = jwt.verify(bearer, process.env.JWT_SECRET || '') as { sub: string; organizationId?: string };
    if (!claims.organizationId) return null;
    const membership = await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: claims.organizationId, userId: claims.sub } } });
    return membership ? { organizationId: membership.organizationId, userId: membership.userId, role: membership.role.toLowerCase() as OrganizationRole, authType: 'session' } : null;
  } catch { return null; }
}
export async function requireOrganizationContext(req: TenantRequest, res: Response, next: NextFunction) {
  const context = await resolveOrganizationContext(req);
  if (!context) return res.status(401).json({ error: 'Unauthorized', message: 'An organization session or API key is required' });
  req.organizationContext = context; next();
}
