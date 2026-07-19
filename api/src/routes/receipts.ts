import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireOrganizationContext, TenantRequest } from '../tenancy/context';
import { requireOrganizationRole } from '../tenancy/authorization';

const prisma = new PrismaClient();
const router = Router();
router.use(requireOrganizationContext);

async function receiptFor(request: TenantRequest, id: string) {
  return prisma.verificationReceipt.findFirst({
    where: { id, organizationId: request.organizationContext!.organizationId },
    include: { claims: { include: { evidenceRelations: true }, orderBy: { createdAt: 'asc' } }, transitions: { orderBy: { createdAt: 'asc' } } },
  });
}

router.get('/compare', async (req: TenantRequest, res) => {
  requireOrganizationRole(req.organizationContext!, 'readResources');
  const leftId = String(req.query.left || ''); const rightId = String(req.query.right || '');
  const [left, right] = await Promise.all([receiptFor(req, leftId), receiptFor(req, rightId)]);
  if (!left || !right) return res.status(404).json({ error: 'Not Found' });
  const changed = (a: unknown, b: unknown) => ({ changed: JSON.stringify(a) !== JSON.stringify(b) });
  res.json({
    same_input: left.taskId === right.taskId,
    program_diff: changed(left.verificationProgramId, right.verificationProgramId),
    context_diff: changed(left.contextSnapshot, right.contextSnapshot),
    interpretation_diff: changed((left.contextSnapshot as any)?.interpretation, (right.contextSnapshot as any)?.interpretation),
    claim_diff: changed(left.claims, right.claims),
    evidence_diff: changed(left.claims.map((claim) => claim.evidenceRelations), right.claims.map((claim) => claim.evidenceRelations)),
    limitation_diff: changed(left.limitations, right.limitations),
    verdict_diff: changed(left.verdict, right.verdict),
    summary: 'Different verification conditions produced different evidential assessments.',
  });
});

router.get('/:id/context', async (req: TenantRequest, res) => {
  requireOrganizationRole(req.organizationContext!, 'readResources'); const receipt = await receiptFor(req, req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Not Found' });
  res.json(receipt.contextSnapshot);
});
router.get('/:id/claims', async (req: TenantRequest, res) => {
  requireOrganizationRole(req.organizationContext!, 'readResources'); const receipt = await receiptFor(req, req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Not Found' }); res.json(receipt.claims);
});
router.get('/:id/evidence-relations', async (req: TenantRequest, res) => {
  requireOrganizationRole(req.organizationContext!, 'readResources'); const receipt = await receiptFor(req, req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Not Found' }); res.json(receipt.claims.flatMap((claim) => claim.evidenceRelations));
});
router.get('/:id/transitions', async (req: TenantRequest, res) => {
  requireOrganizationRole(req.organizationContext!, 'readResources'); const receipt = await receiptFor(req, req.params.id);
  if (!receipt) return res.status(404).json({ error: 'Not Found' }); res.json(receipt.transitions);
});

export { router as receiptRoutes };
