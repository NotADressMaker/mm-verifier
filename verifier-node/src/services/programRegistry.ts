import { ProgramRegistry } from '../../../programs/registry';
import { logger } from '../utils/logger';

const registry = new ProgramRegistry({
  programsDir: process.env.PROGRAMS_DIR,
  allowedPrograms: process.env.ALLOWED_PROGRAMS?.split(',').map((entry) => entry.trim()).filter(Boolean),
  expectedProgramHashes: process.env.PROGRAM_HASHES ? JSON.parse(process.env.PROGRAM_HASHES) : undefined,
  defaultProgram: process.env.DEFAULT_PROGRAM ?? 'factual-consensus@1.0.0',
});

try {
  registry.loadPrograms();
} catch (error: any) {
  logger.error('Failed to load verification programs', { error: error.message });
}

export { registry as programRegistry };
