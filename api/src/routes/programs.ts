import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getProgram, listPrograms } from '../services/programRegistry';

const router = Router();

/**
 * POST /api/programs
 * Register a new verification program
 */
router.post('/', async (_req: Request, res: Response) => {
  res.status(400).json({
    error: 'Invalid program',
    message: 'Program registration is handled via filesystem plugins.',
  });
});

/**
 * GET /api/programs
 * List registered verification programs
 */
router.get('/', (req: Request, res: Response) => {
  const programs = listPrograms();
  res.status(200).json({
    total: programs.length,
    programs,
  });
});

/**
 * GET /api/programs/:programId
 * Fetch a specific verification program
 */
router.get('/:programId', (req: Request, res: Response) => {
  try {
    const { programId } = req.params;
    const [id, version] = programId.split('@');
    const record = getProgram(id, version);

    if (!record) {
      return res.status(404).json({
        error: 'Program not found',
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
      error: 'Internal error',
      message: error.message || 'Internal Server Error',
    });
  }
});

export { router as programRoutes };
