import { Router, Request, Response } from 'express';
import { validateEducationRequest } from '../../../../shared/education/schemas';
import { verifyEducation } from '../../services/educationVerification';
import { logger } from '../../utils/logger';
const router = Router();
router.use((_req, res, next) => { res.setHeader('X-MAMV-API-Version', '1'); next(); });
router.post('/verify', (req: Request, res: Response) => {
  const validation = validateEducationRequest(req.body);
  if (!validation.value) return res.status(400).json({ errors: validation.errors.map(error => ({ code: 'INVALID_INPUT', ...error })) });
  const result = verifyEducation(validation.value);
  logger.info('Education verification completed', { taskId: result.task_id, mode: validation.value.mode, contentLength: validation.value.content.length, rawContentPersisted: false });
  return res.status(201).json(result);
});
export { router as educationV1Routes };
