import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { logger } from '../../utils/logger';
import {
  getProgram,
  listPrograms,
  registerProgram,
  validateVerificationProgram,
  VerificationProgram,
} from '../../services/programRegistry';

const router = Router();

router.use((req, res, next) => {
  res.setHeader('X-MMV-API-Version', '1');
  next();
});

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
        return res.status(400).json({
          errors: [
            {
              code: 'INVALID_INPUT',
              message: 'Program validation failed',
              details: { errors: errors.array() },
            },
          ],
        });
      }

      const program = req.body as VerificationProgram;
      const validation = validateVerificationProgram(program);
      if (!validation.valid) {
        return res.status(400).json({
          errors: [
            {
              code: 'INVALID_INPUT',
              message: validation.message || 'Invalid program',
            },
          ],
        });
      }

      const record = registerProgram(program);

      logger.info('Registered verification program', {
        programId: record.id,
        fingerprint: record.fingerprint,
        name: program.name,
        version: program.version,
      });

      res.status(201).json({
        program_id: record.id,
        fingerprint: record.fingerprint,
        program: record.program,
        created_at: record.createdAt,
      });
    } catch (error: any) {
      logger.error('Error registering verification program:', error);
      res.status(500).json({
        errors: [
          {
            code: 'INTERNAL_ERROR',
            message: error.message || 'Internal Server Error',
          },
        ],
      });
    }
  }
);

router.get('/', (req: Request, res: Response) => {
  const programs = listPrograms();
  res.status(200).json({
    total: programs.length,
    programs: programs.map((record) => ({
      program_id: record.id,
      fingerprint: record.fingerprint,
      program: record.program,
      created_at: record.createdAt,
    })),
  });
});

router.get('/:programId', (req: Request, res: Response) => {
  const { programId } = req.params;
  const record = getProgram(programId);

  if (!record) {
    return res.status(404).json({
      errors: [
        {
          code: 'NOT_FOUND',
          message: 'Program not found',
        },
      ],
    });
  }

  res.status(200).json({
    program_id: record.id,
    fingerprint: record.fingerprint,
    program: record.program,
    created_at: record.createdAt,
  });
});

export { router as programV1Routes };
