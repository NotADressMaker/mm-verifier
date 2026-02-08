import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { getProgram, listPrograms } from '../../services/programRegistry';

const router = Router();

router.use((req, res, next) => {
  res.setHeader('X-MMV-API-Version', '1');
  next();
});

router.post('/', async (_req: Request, res: Response) => {
  res.status(400).json({
    errors: [
      {
        code: 'INVALID_INPUT',
        message: 'Program registration is handled via filesystem plugins.',
      },
    ],
  });
});

router.get('/', (req: Request, res: Response) => {
  const programs = listPrograms();
  res.status(200).json({
    total: programs.length,
    programs,
  });
});

router.get('/:programId', (req: Request, res: Response) => {
  try {
    const { programId } = req.params;
    const [id, version] = programId.split('@');
    const record = getProgram(id, version);

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
      id: record.id,
      version: record.version,
      description: record.description,
      hash: record.hash,
    });
  } catch (error: any) {
    logger.error('Error fetching verification program', { error: error.message });
    res.status(500).json({
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Internal Server Error',
        },
      ],
    });
  }
});

export { router as programV1Routes };
