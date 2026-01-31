import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export type ProgramStepType =
  | 'prompt'
  | 'retrieve'
  | 'cross-check'
  | 'score'
  | 'evidence'
  | 'consensus';

export interface ProgramStep {
  id?: string;
  type: ProgramStepType;
  description?: string;
  config?: Record<string, unknown>;
}

export interface ProgramReference {
  name: string;
  version?: string;
}

export interface VerificationProgram {
  name: string;
  version: string;
  description?: string;
  steps: ProgramStep[];
  tags?: string[];
}

export interface ProgramRecord {
  id: string;
  program: VerificationProgram;
  hash: string;
  createdAt: string;
}

const programRegistry = new Map<string, ProgramRecord>();
const programHashIndex = new Map<string, string>();
const programNameIndex = new Map<string, Map<string, string>>();

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

  if (!Array.isArray(program.steps) || program.steps.length === 0) {
    return { valid: false, message: 'Program must include at least one step.' };
  }

  if (program.tags && (!Array.isArray(program.tags) || program.tags.some((tag: any) => typeof tag !== 'string'))) {
    return { valid: false, message: 'Program tags must be an array of strings.' };
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

  const stepIds = program.steps
    .map((step: any, index: number) => (step?.id ? String(step.id).trim() : `step-${index + 1}`))
    .filter((id: string) => id.length > 0);
  const uniqueIds = new Set(stepIds);
  if (uniqueIds.size !== stepIds.length) {
    return { valid: false, message: 'Step IDs must be unique.' };
  }

  return { valid: true };
}

function normalizeProgram(program: VerificationProgram): VerificationProgram {
  const normalizedSteps = program.steps.map((step, index) => ({
    id: step.id ? String(step.id).trim() : `step-${index + 1}`,
    type: step.type,
    description: step.description?.trim(),
    config: step.config,
  }));

  return {
    name: program.name.trim(),
    version: program.version.trim(),
    description: program.description?.trim(),
    steps: normalizedSteps,
    tags: program.tags?.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashProgram(program: VerificationProgram): string {
  const normalized = normalizeProgram(program);
  return crypto.createHash('sha256').update(stableStringify(normalized)).digest('hex');
}

export function registerProgram(program: VerificationProgram): ProgramRecord {
  const normalized = normalizeProgram(program);
  const hash = hashProgram(normalized);

  const existingId = programHashIndex.get(hash);
  if (existingId) {
    const existing = programRegistry.get(existingId);
    if (existing) {
      return existing;
    }
  }

  const id = uuidv4();
  const record: ProgramRecord = {
    id,
    program: normalized,
    hash,
    createdAt: new Date().toISOString(),
  };

  programRegistry.set(id, record);
  programHashIndex.set(hash, id);

  const nameKey = normalized.name.toLowerCase();
  const versionKey = normalized.version.toLowerCase();
  const versionMap = programNameIndex.get(nameKey) ?? new Map<string, string>();
  versionMap.set(versionKey, id);
  programNameIndex.set(nameKey, versionMap);

  return record;
}

export function listPrograms(): ProgramRecord[] {
  return Array.from(programRegistry.values());
}

export function getProgram(programId: string): ProgramRecord | undefined {
  return programRegistry.get(programId);
}

export function getProgramByHash(hash: string): ProgramRecord | undefined {
  const id = programHashIndex.get(hash);
  if (!id) {
    return undefined;
  }
  return programRegistry.get(id);
}

export function resolveProgramReference(ref: ProgramReference): ProgramRecord | undefined {
  const nameKey = ref.name.toLowerCase();
  const versionKey = ref.version?.toLowerCase();
  const versionMap = programNameIndex.get(nameKey);
  if (!versionMap) {
    return undefined;
  }

  if (versionKey) {
    const id = versionMap.get(versionKey);
    if (!id) {
      return undefined;
    }
    return programRegistry.get(id);
  }

  const latest = Array.from(versionMap.entries()).sort(([a], [b]) => b.localeCompare(a))[0];
  if (!latest) {
    return undefined;
  }
  return programRegistry.get(latest[1]);
}
