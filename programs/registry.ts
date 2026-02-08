import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Ajv from 'ajv';
import semver from 'semver';
import { canonicalize } from '../shared/canonicalJson';
import {
  EvidenceRequirement,
  ProgramManifest,
  ProgramRecord,
  ProgramContext,
  VerificationProgram,
} from './interface';
import { validateEvidenceBundleV1, validateReceiptV1 } from '../shared/schemaValidation';
import { EvidenceBundle } from '../shared/types';
import { VerificationReceipt } from '../shared/receipt';

export type ProgramRegistryConfig = {
  programsDir?: string;
  allowedPrograms?: string[];
  expectedProgramHashes?: Record<string, string>;
  defaultProgram?: string;
};

const DEFAULT_PROGRAMS_DIR = path.resolve(process.cwd(), 'programs');

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });

export function computeProgramHash(programDir: string, manifest: ProgramManifest): string {
  const manifestPayload = canonicalize({
    id: manifest.id,
    version: manifest.version,
    entrypoint: manifest.entrypoint,
  });

  const files = collectProgramFiles(programDir)
    .filter((file) => path.basename(file) !== 'manifest.json')
    .sort();

  const hash = crypto.createHash('sha256');
  hash.update(manifestPayload, 'utf8');

  for (const file of files) {
    const relative = path.relative(programDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    hash.update(`\n${relative}\n`);
    hash.update(content);
  }

  return hash.digest('hex');
}

export function isValidSemver(version: string): boolean {
  return Boolean(semver.valid(version));
}

function collectProgramFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) {
        continue;
      }
      files.push(...collectProgramFiles(fullPath));
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.map')) {
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

function loadManifest(programDir: string): ProgramManifest {
  const manifestPath = path.join(programDir, 'manifest.json');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as ProgramManifest;

  if (!manifest.id || !manifest.version || !manifest.entrypoint) {
    throw new Error(`Invalid manifest in ${programDir}`);
  }

  if (!isValidSemver(manifest.version)) {
    throw new Error(`Invalid semver version "${manifest.version}" in ${programDir}`);
  }

  return manifest;
}

function resolveProgramModule(entrypoint: string): VerificationProgram {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const module = require(entrypoint);
  const program = (module?.program ?? module?.default ?? module) as VerificationProgram;

  if (!program || typeof program.run !== 'function') {
    throw new Error(`Program entrypoint did not export a valid program: ${entrypoint}`);
  }

  return program;
}

function validateEvidenceRequirements(bundle: EvidenceBundle, requirements?: EvidenceRequirement): string[] {
  const errors: string[] = [];
  if (!requirements) return errors;

  const requiredSections = requirements.required_sections ?? [];
  for (const section of requiredSections) {
    if (!(section in bundle)) {
      errors.push(`Missing required evidence section: ${section}`);
    }
  }

  if (requirements.min_model_runs !== undefined) {
    if (!Array.isArray(bundle.model_runs) || bundle.model_runs.length < requirements.min_model_runs) {
      errors.push(`At least ${requirements.min_model_runs} model_runs required`);
    }
  }

  return errors;
}

export class ProgramRegistry {
  private readonly programsDir: string;
  private readonly allowedPrograms?: string[];
  private readonly expectedProgramHashes?: Record<string, string>;
  private readonly defaultProgram?: string;
  private readonly programs = new Map<string, ProgramRecord>();

  constructor(config: ProgramRegistryConfig = {}) {
    this.programsDir = config.programsDir ?? DEFAULT_PROGRAMS_DIR;
    this.allowedPrograms = config.allowedPrograms;
    this.expectedProgramHashes = config.expectedProgramHashes;
    this.defaultProgram = config.defaultProgram;
  }

  loadPrograms(): void {
    if (!fs.existsSync(this.programsDir)) {
      throw new Error(`Programs directory not found: ${this.programsDir}`);
    }

    const entries = fs.readdirSync(this.programsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const programDir = path.join(this.programsDir, entry.name);
      const manifestPath = path.join(programDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        continue;
      }
      const record = this.loadProgramFromDir(programDir);
      const key = `${record.id}@${record.version}`;
      this.programs.set(key, record);
    }
  }

  private loadProgramFromDir(programDir: string): ProgramRecord {
    const manifest = loadManifest(programDir);
    const entrypointPath = path.resolve(programDir, manifest.entrypoint);

    const program = resolveProgramModule(entrypointPath);

    if (program.id !== manifest.id) {
      throw new Error(`Program id mismatch in ${programDir}`);
    }

    if (program.version !== manifest.version) {
      throw new Error(`Program version mismatch in ${programDir}`);
    }

    const hash = computeProgramHash(programDir, manifest);
    const record: ProgramRecord = {
      id: program.id,
      version: program.version,
      description: program.description,
      hash,
      entrypoint: entrypointPath,
      program,
      manifest,
    };

    if (this.allowedPrograms && !this.isProgramAllowed(record.id, record.version)) {
      throw new Error(`Program ${record.id}@${record.version} is not allowed`);
    }

    const expectedHash = this.expectedProgramHashes?.[`${record.id}@${record.version}`];
    if (expectedHash && expectedHash !== record.hash) {
      throw new Error(
        `Program hash mismatch for ${record.id}@${record.version}: expected ${expectedHash}, got ${record.hash}`
      );
    }

    return record;
  }

  listPrograms(): ProgramRecord[] {
    return Array.from(this.programs.values());
  }

  getProgram(id: string, version?: string): ProgramRecord | undefined {
    if (version) {
      return this.programs.get(`${id}@${version}`);
    }

    const candidates = Array.from(this.programs.values()).filter((record) => record.id === id);
    if (candidates.length === 1) {
      return candidates[0];
    }

    return undefined;
  }

  resolveProgram(id?: string, version?: string): ProgramRecord {
    if (!id && this.defaultProgram) {
      const [defaultId, defaultVersion] = this.defaultProgram.split('@');
      id = defaultId;
      version = defaultVersion;
    }

    if (!id) {
      throw new Error('Program id is required');
    }

    const record = this.getProgram(id, version);
    if (!record) {
      throw new Error(`Program not found: ${id}${version ? `@${version}` : ''}`);
    }

    return record;
  }

  hashProgram(id: string, version: string): string {
    const record = this.getProgram(id, version);
    if (!record) {
      throw new Error(`Program not found: ${id}@${version}`);
    }
    return record.hash;
  }

  verifyProgram(id: string, version: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const record = this.getProgram(id, version);
    if (!record) {
      return { valid: false, errors: [`Program not found: ${id}@${version}`] };
    }

    if (!isValidSemver(record.version)) {
      errors.push(`Invalid semver version: ${record.version}`);
    }

    const expectedHash = this.expectedProgramHashes?.[`${record.id}@${record.version}`];
    if (expectedHash && expectedHash !== record.hash) {
      errors.push(`Program hash mismatch: expected ${expectedHash}, got ${record.hash}`);
    }

    return { valid: errors.length === 0, errors };
  }

  async runProgram(
    bundle: EvidenceBundle,
    context: ProgramContext,
    programId?: string,
    programVersion?: string
  ): Promise<VerificationReceipt> {
    const record = this.resolveProgram(programId, programVersion);
    const inputValidation = validateEvidenceBundleV1(bundle);
    if (!inputValidation.valid) {
      throw new Error(`Evidence bundle failed schema validation: ${inputValidation.errors[0]?.message}`);
    }

    const requirementErrors = validateEvidenceRequirements(bundle, record.program.evidence_requirements);
    if (requirementErrors.length) {
      throw new Error(requirementErrors.join('; '));
    }

    const inputSchemaValid = ajv.validate(record.program.input_schema, bundle);
    if (!inputSchemaValid) {
      throw new Error(`Program input schema validation failed: ${ajv.errorsText()}`);
    }

    const receipt = await record.program.run(bundle, context);

    const outputSchemaValid = ajv.validate(record.program.output_schema, receipt);
    if (!outputSchemaValid) {
      throw new Error(`Program output schema validation failed: ${ajv.errorsText()}`);
    }

    const receiptValidation = validateReceiptV1(receipt);
    if (!receiptValidation.valid) {
      throw new Error(`Receipt schema validation failed: ${receiptValidation.errors[0]?.message}`);
    }

    return receipt;
  }

  private isProgramAllowed(id: string, version: string): boolean {
    if (!this.allowedPrograms) return true;
    return this.allowedPrograms.some((entry) => entry === id || entry === `${id}@${version}`);
  }
}
