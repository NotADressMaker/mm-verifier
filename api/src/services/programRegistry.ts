import { v4 as uuidv4 } from 'uuid';
import {
  ProgramDefinition,
  ProgramIO,
  ProgramStep,
  ProgramStepType,
} from '../../../shared/httpSchemas';
import {
  computeProgramFingerprint,
  ProgramDefinitionWithLimits,
  MeteringLimits,
  DEFAULT_METERING_LIMITS,
  generateProgramId,
} from '../../../shared/programs';

export type VerificationProgram = ProgramDefinitionWithLimits;

export interface ProgramRecord {
  id: string;
  fingerprint: string;
  program: VerificationProgram;
  createdAt: string;
}

const programRegistry = new Map<string, ProgramRecord>();

export function validateVerificationProgram(program: any): { valid: boolean; message?: string } {
  if (!program || typeof program !== 'object') {
    return { valid: false, message: 'Program must be an object.' };
  }

  if (typeof program.name !== 'string' || program.name.trim().length === 0) {
    return { valid: false, message: 'Program name is required.' };
  }

  if (typeof program.version !== 'string' || program.version.trim().length === 0) {
    return { valid: false, message: 'Program version is required.' };
  }

  const validateIo = (io: ProgramIO, label: string) => {
    if (!io || typeof io !== 'object') {
      return `${label} entries must be objects.`;
    }

    if (typeof io.name !== 'string' || io.name.trim().length === 0) {
      return `${label} name is required.`;
    }

    if (typeof io.type !== 'string' || io.type.trim().length === 0) {
      return `${label} type is required.`;
    }

    if (io.description && typeof io.description !== 'string') {
      return `${label} description must be a string.`;
    }

    if (io.required !== undefined && typeof io.required !== 'boolean') {
      return `${label} required flag must be boolean.`;
    }

    return null;
  };

  if (program.inputs && !Array.isArray(program.inputs)) {
    return { valid: false, message: 'Program inputs must be an array.' };
  }

  if (program.outputs && !Array.isArray(program.outputs)) {
    return { valid: false, message: 'Program outputs must be an array.' };
  }

  for (const input of program.inputs || []) {
    const error = validateIo(input, 'Input');
    if (error) {
      return { valid: false, message: error };
    }
  }

  for (const output of program.outputs || []) {
    const error = validateIo(output, 'Output');
    if (error) {
      return { valid: false, message: error };
    }
  }

  if (!Array.isArray(program.steps) || program.steps.length === 0) {
    return { valid: false, message: 'Program must include at least one step.' };
  }

  for (const step of program.steps) {
    if (!step || typeof step !== 'object') {
      return { valid: false, message: 'Each step must be an object.' };
    }

    const validTypes: ProgramStepType[] = [
      'prompt',
      'retrieve',
      'cross-check',
      'score',
      'evidence',
      'consensus',
    ];

    if (!validTypes.includes(step.type)) {
      return { valid: false, message: `Invalid step type: ${step.type}` };
    }

    if (step.description && typeof step.description !== 'string') {
      return { valid: false, message: 'Step description must be a string.' };
    }

    if (step.config && (typeof step.config !== 'object' || Array.isArray(step.config))) {
      return { valid: false, message: 'Step config must be an object.' };
    }
  }

  return { valid: true };
}

// Index by fingerprint for deduplication
const fingerprintIndex = new Map<string, string>(); // fingerprint -> programId

export function registerProgram(program: VerificationProgram): ProgramRecord {
  // Compute deterministic fingerprint
  const fingerprint = computeProgramFingerprint(program);

  // Check if a program with this fingerprint already exists
  const existingId = fingerprintIndex.get(fingerprint);
  if (existingId) {
    const existing = programRegistry.get(existingId);
    if (existing) {
      return existing;
    }
  }

  // Generate ID from fingerprint for reproducibility
  const id = generateProgramId(fingerprint);
  const record: ProgramRecord = {
    id,
    fingerprint,
    program,
    createdAt: new Date().toISOString(),
  };

  programRegistry.set(id, record);
  fingerprintIndex.set(fingerprint, id);
  return record;
}

export function listPrograms(): ProgramRecord[] {
  return Array.from(programRegistry.values());
}

export function getProgram(programId: string): ProgramRecord | undefined {
  return programRegistry.get(programId);
}

export function getProgramByFingerprint(fingerprint: string): ProgramRecord | undefined {
  const programId = fingerprintIndex.get(fingerprint);
  if (!programId) {
    return undefined;
  }
  return programRegistry.get(programId);
}

export function getDefaultMeteringLimits(): MeteringLimits {
  return { ...DEFAULT_METERING_LIMITS };
}
