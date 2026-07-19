import { Router, Response } from 'express';
import { PrismaClient, OrganizationRole } from '@prisma/client';
import { TenantRequest, requireOrganizationContext } from '../tenancy/context';
import { can, requireOrganizationRole } from '../tenancy/authorization';
import { API_KEY_SCOPES, createApiKeyMaterial } from '../tenancy/apiKeys';

const prisma = new PrismaClient();
const router = Router();
router.use(requireOrganizationContext);
const fail = (res: Response, error: unknown) => res.status((error as { status?: number }).status || 500).json({ error: (error as Error).message || 'Internal Server Error' });
const audit = (organizationId: string, actorUserId: string | undefined, action: string, metadata?: object) => prisma.auditEvent.create({ data: { organizationId, actorUserId, action, metadata } });

router.get('/', async (req: TenantRequest, res) => {
  if (!req.organizationContext?.userId) return res.status(403).json({ error: 'Forbidden' });
  const memberships = await prisma.organizationMembership.findMany({ where: { userId: req.organizationContext.userId }, include: { organization: true } });
  res.json({ organizations: memberships.map(({ organization, role }) => ({ ...organization, role: role.toLowerCase() })) });
});

router.post('/switch', async (req: TenantRequest, res) => {
  const userId = req.organizationContext?.userId; const organizationId = req.body?.organizationId;
  if (!userId || typeof organizationId !== 'string') return res.status(400).json({ error: 'organizationId is required' });
  const membership = await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!membership) return res.status(404).json({ error: 'Not Found' });
  // The caller must issue a new signed session containing this organizationId. Never trust a client-side selection alone.
  res.json({ organizationId: membership.organizationId, role: membership.role.toLowerCase(), requiresSessionRefresh: true });
});

router.get('/current', async (req: TenantRequest, res) => {
  const organization = await prisma.organization.findUnique({ where: { id: req.organizationContext!.organizationId } });
  if (!organization) return res.status(404).json({ error: 'Not Found' });
  res.json({ organization, role: req.organizationContext!.role });
});
router.patch('/current', async (req: TenantRequest, res) => { try {
  requireOrganizationRole(req.organizationContext!, 'manageOrganization');
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 120) return res.status(400).json({ error: 'A valid organization name is required' });
  const organization = await prisma.organization.update({ where: { id: req.organizationContext!.organizationId }, data: { name } });
  await audit(organization.id, req.organizationContext!.userId, 'ORGANIZATION_CHANGED', { name });
  res.json({ organization });
} catch (error) { fail(res, error); } });

router.get('/current/settings', async (req: TenantRequest, res) => {
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: req.organizationContext!.organizationId } });
  res.json({ settings });
});
router.patch('/current/settings', async (req: TenantRequest, res) => { try {
  requireOrganizationRole(req.organizationContext!, 'manageSettings');
  const allowed = ['displayName','logoUrl','primaryDomain','receiptPrefix','publicReceiptsEnabled','walletLoginEnabled','onchainAnchoringEnabled','educationFeaturesEnabled','customBrandingEnabled'];
  const data = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (typeof data.logoUrl === 'string' && !/^https:\/\//.test(data.logoUrl)) return res.status(400).json({ error: 'logoUrl must use https' });
  const settings = await prisma.organizationSettings.upsert({ where: { organizationId: req.organizationContext!.organizationId }, create: { organizationId: req.organizationContext!.organizationId, ...data }, update: data });
  await audit(req.organizationContext!.organizationId, req.organizationContext!.userId, 'SETTINGS_CHANGED'); res.json({ settings });
} catch (error) { fail(res, error); } });

router.get('/current/members', async (req: TenantRequest, res) => {
  const members = await prisma.organizationMembership.findMany({ where: { organizationId: req.organizationContext!.organizationId }, include: { user: { select: { id: true, email: true, externalId: true } } } });
  res.json({ members });
});
// Invitations intentionally attach only an existing application identity. Account
// provisioning and email delivery remain the responsibility of the auth service.
router.post('/current/members', async (req: TenantRequest, res) => { try {
  requireOrganizationRole(req.organizationContext!, 'manageMembers');
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const role = String(req.body?.role || 'MEMBER').toUpperCase() as OrganizationRole;
  if (!email || !Object.values(OrganizationRole).includes(role) || (role === 'OWNER' && req.organizationContext!.role !== 'owner')) return res.status(400).json({ error: 'A valid email and role are required' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'User not found. Ask them to create an account before inviting them.' });
  const member = await prisma.organizationMembership.create({ data: { organizationId: req.organizationContext!.organizationId, userId: user.id, role } });
  await audit(req.organizationContext!.organizationId, req.organizationContext!.userId, 'MEMBER_INVITED', { userId: user.id, role });
  res.status(201).json({ member });
} catch (error) { fail(res, error); } });
router.patch('/current/members/:userId', async (req: TenantRequest, res) => { try {
  requireOrganizationRole(req.organizationContext!, 'manageMembers');
  const role = String(req.body?.role || '').toUpperCase() as OrganizationRole;
  if (!Object.values(OrganizationRole).includes(role) || (role === 'OWNER' && req.organizationContext!.role !== 'owner')) return res.status(403).json({ error: 'Forbidden' });
  const where = { organizationId_userId: { organizationId: req.organizationContext!.organizationId, userId: req.params.userId } };
  const existing = await prisma.organizationMembership.findUnique({ where }); if (!existing) return res.status(404).json({ error: 'Not Found' });
  if (existing.role === 'OWNER' && role !== 'OWNER') { const owners = await prisma.organizationMembership.count({ where: { organizationId: req.organizationContext!.organizationId, role: 'OWNER' } }); if (owners < 2) return res.status(409).json({ error: 'Cannot remove final owner' }); }
  const member = await prisma.organizationMembership.update({ where, data: { role } }); await audit(req.organizationContext!.organizationId, req.organizationContext!.userId, 'ROLE_CHANGED'); res.json({ member });
} catch (error) { fail(res, error); } });
router.delete('/current/members/:userId', async (req: TenantRequest, res) => { try {
  requireOrganizationRole(req.organizationContext!, 'manageMembers');
  const where = { organizationId_userId: { organizationId: req.organizationContext!.organizationId, userId: req.params.userId } };
  const existing = await prisma.organizationMembership.findUnique({ where });
  if (!existing) return res.status(404).json({ error: 'Not Found' });
  if (existing.role === 'OWNER') { const owners = await prisma.organizationMembership.count({ where: { organizationId: req.organizationContext!.organizationId, role: 'OWNER' } }); if (owners < 2) return res.status(409).json({ error: 'Cannot remove final owner' }); }
  await prisma.organizationMembership.delete({ where });
  await audit(req.organizationContext!.organizationId, req.organizationContext!.userId, 'MEMBER_REMOVED', { userId: req.params.userId });
  res.status(204).end();
} catch (error) { fail(res, error); } });

router.get('/current/api-keys', async (req: TenantRequest, res) => { try { requireOrganizationRole(req.organizationContext!, 'manageApiKeys'); const keys = await prisma.organizationApiKey.findMany({ where: { organizationId: req.organizationContext!.organizationId }, select: { id: true, name: true, keyPrefix: true, scopes: true, createdAt: true, expiresAt: true, revokedAt: true, lastUsedAt: true } }); res.json({ keys }); } catch (e) { fail(res, e); } });
router.post('/current/api-keys', async (req: TenantRequest, res) => { try { requireOrganizationRole(req.organizationContext!, 'manageApiKeys'); if (!req.organizationContext!.userId) return res.status(403).json({ error: 'Session authentication required' }); const scopes = (req.body?.scopes || []).filter((scope: string) => API_KEY_SCOPES.includes(scope as any)); if (!scopes.length) return res.status(400).json({ error: 'At least one valid scope is required' }); const material = createApiKeyMaterial(); const key = await prisma.organizationApiKey.create({ data: { organizationId: req.organizationContext!.organizationId, createdByUserId: req.organizationContext!.userId, name: String(req.body?.name || 'API key'), scopes, keyPrefix: material.prefix, keyHash: material.hash, expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : undefined } }); await audit(req.organizationContext!.organizationId, req.organizationContext!.userId, 'API_KEY_CREATED', { keyId: key.id }); res.status(201).json({ key: { id: key.id, name: key.name, prefix: key.keyPrefix, scopes: key.scopes }, plaintextKey: material.plaintext }); } catch (e) { fail(res, e); } });
router.delete('/current/api-keys/:id', async (req: TenantRequest, res) => { try { requireOrganizationRole(req.organizationContext!, 'manageApiKeys'); const result = await prisma.organizationApiKey.updateMany({ where: { id: req.params.id, organizationId: req.organizationContext!.organizationId, revokedAt: null }, data: { revokedAt: new Date() } }); if (!result.count) return res.status(404).json({ error: 'Not Found' }); await audit(req.organizationContext!.organizationId, req.organizationContext!.userId, 'API_KEY_REVOKED'); res.status(204).end(); } catch (e) { fail(res, e); } });

router.get('/current/tasks', async (req: TenantRequest, res) => { try { requireOrganizationRole(req.organizationContext!, 'readResources'); const tasks = await prisma.verificationTask.findMany({ where: { organizationId: req.organizationContext!.organizationId }, orderBy: { createdAt: 'desc' } }); res.json({ tasks }); } catch (e) { fail(res, e); } });
router.get('/current/tasks/:id', async (req: TenantRequest, res) => { const task = await prisma.verificationTask.findFirst({ where: { id: req.params.id, organizationId: req.organizationContext!.organizationId } }); if (!task) return res.status(404).json({ error: 'Not Found' }); res.json({ task }); });
router.get('/current/activity', async (req: TenantRequest, res) => { try {
  requireOrganizationRole(req.organizationContext!, 'readResources');
  const events = await prisma.auditEvent.findMany({ where: { organizationId: req.organizationContext!.organizationId }, orderBy: { createdAt: 'desc' }, take: 12 });
  res.json({ events });
} catch (error) { fail(res, error); } });
export { router as organizationRoutes };
