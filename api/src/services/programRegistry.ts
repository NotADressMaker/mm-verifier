import { ProgramRegistry } from '../../../programs/registry';
import { ProgramRecord } from '../../../programs/interface';
import { logger } from '../utils/logger';

export type ProgramSummary = {
  id: string;
  version: string;
  description: string;
  hash: string;
};

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

export function listPrograms(): ProgramSummary[] {
  return registry.listPrograms().map((program) => ({
    id: program.id,
    version: program.version,
    description: program.description,
    hash: program.hash,
  }));
}

export function getProgram(id: string, version?: string): ProgramRecord | undefined {
  return registry.getProgram(id, version);
}

export function resolveProgram(id?: string, version?: string): ProgramRecord {
  return registry.resolveProgram(id, version);
}

export function verifyProgram(id: string, version: string): { valid: boolean; errors: string[] } {
  return registry.verifyProgram(id, version);
}

export function hashProgram(id: string, version: string): string {
  return registry.hashProgram(id, version);
}
