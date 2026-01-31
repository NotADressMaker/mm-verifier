import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import {
  getProgram,
  getProgramByHash,
  listPrograms,
  registerProgram,
  resolveProgramReference,
  validateVerificationProgram,
  VerificationProgram,
} from '../services/programRegistry';

const router = Router();

/**
 * POST /api/programs
 * Register a new verification program
 */
router.post(
  '/',
  [
    body('name').isString().notEmpty().withMessage('Program name is required'),
    body('version').isString().notEmpty().withMessage('Program version is required'),
    body('steps').isArray({ min: 1 }).withMessage('Program must include at least one step'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const program = req.body as VerificationProgram;
      const validation = validateVerificationProgram(program);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid program', message: validation.message });
      }

      const record = registerProgram(program);

      logger.info('Registered verification program', {
        programId: record.id,
        name: program.name,
        version: program.version,
      });

      res.status(201).json({
        programId: record.id,
        programHash: record.hash,
        program: record.program,
        createdAt: record.createdAt,
      });
    } catch (error: any) {
      logger.error('Error registering verification program:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/programs
 * List registered verification programs
 */
router.get('/', (req: Request, res: Response) => {
  const { name } = req.query as { name?: string };
  let programs = listPrograms();
  if (name) {
    const nameKey = name.toLowerCase();
    programs = programs.filter((record) => record.program.name.toLowerCase() === nameKey);
  }

  res.status(200).json({
    total: programs.length,
    programs,
  });
});

/**
 * GET /api/programs/resolve
 * Resolve program by name/version or hash
 */
router.get('/resolve', (req: Request, res: Response) => {
  const { name, version, hash } = req.query as { name?: string; version?: string; hash?: string };

  let record;
  if (hash) {
    record = getProgramByHash(hash);
  } else if (name) {
    record = resolveProgramReference({ name, version });
  }

  if (!record) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Program not found',
    });
  }

  res.status(200).json(record);
});

/**
 * GET /api/programs/:programId
 * Fetch a specific verification program
 */
router.get('/:programId', (req: Request, res: Response) => {
  const { programId } = req.params;
  const record = getProgram(programId);

  if (!record) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Program not found',
    });
  }

  res.status(200).json(record);
});

export { router as programRoutes };
