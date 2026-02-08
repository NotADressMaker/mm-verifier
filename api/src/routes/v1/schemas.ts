import { Router, Request, Response } from 'express';
import {
  validateEvidenceBundleV1,
  validateReceiptPayload,
} from '../../../../shared/schemaValidation';

const router = Router();

router.post('/receipts/validate', (req: Request, res: Response) => {
  const validation = validateReceiptPayload(req.body?.receipt ?? req.body);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'SchemaValidationError',
      path: validation.errors[0]?.path ?? '/',
      message: validation.errors[0]?.message ?? 'Invalid receipt',
      schemaVersion: validation.schemaVersion,
    });
  }

  return res.status(200).json({ valid: true });
});

router.post('/evidence-bundles/validate', (req: Request, res: Response) => {
  const validation = validateEvidenceBundleV1(req.body?.bundle ?? req.body);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'SchemaValidationError',
      path: validation.errors[0]?.path ?? '/',
      message: validation.errors[0]?.message ?? 'Invalid evidence bundle',
      schemaVersion: 'v1',
    });
  }

  return res.status(200).json({ valid: true });
});

export { router as schemaV1Routes };
