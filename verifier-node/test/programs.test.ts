import {
  computeProgramFingerprint,
  getProgramCanonicalJson,
  programsMatch,
  validateProgram,
  isProgramDefinition,
  generateProgramId,
  createProgramRecord,
  ProgramDefinitionWithLimits,
  DEFAULT_METERING_LIMITS,
} from '../../shared/programs';

describe('Program Fingerprinting', () => {
  const sampleProgram: ProgramDefinitionWithLimits = {
    name: 'test-program',
    version: '1.0.0',
    description: 'A test program',
    steps: [
      { type: 'prompt', config: { temperature: 0.1 } },
      { type: 'cross-check' },
      { type: 'score' },
    ],
  };

  describe('computeProgramFingerprint', () => {
    it('should produce deterministic fingerprint', () => {
      const hash1 = computeProgramFingerprint(sampleProgram);
      const hash2 = computeProgramFingerprint(sampleProgram);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should differ for different programs', () => {
      const program2: ProgramDefinitionWithLimits = {
        ...sampleProgram,
        name: 'different-program',
      };

      const hash1 = computeProgramFingerprint(sampleProgram);
      const hash2 = computeProgramFingerprint(program2);

      expect(hash1).not.toBe(hash2);
    });

    it('should differ for different versions', () => {
      const program2: ProgramDefinitionWithLimits = {
        ...sampleProgram,
        version: '2.0.0',
      };

      const hash1 = computeProgramFingerprint(sampleProgram);
      const hash2 = computeProgramFingerprint(program2);

      expect(hash1).not.toBe(hash2);
    });

    it('should differ for different steps', () => {
      const program2: ProgramDefinitionWithLimits = {
        ...sampleProgram,
        steps: [
          { type: 'prompt' },
          { type: 'score' },
        ],
      };

      const hash1 = computeProgramFingerprint(sampleProgram);
      const hash2 = computeProgramFingerprint(program2);

      expect(hash1).not.toBe(hash2);
    });

    it('should include limits in fingerprint', () => {
      const programWithLimits: ProgramDefinitionWithLimits = {
        ...sampleProgram,
        limits: {
          max_llm_calls: 5,
          max_total_tokens: 10000,
          max_execution_ms: 30000,
        },
      };

      const hash1 = computeProgramFingerprint(sampleProgram);
      const hash2 = computeProgramFingerprint(programWithLimits);

      expect(hash1).not.toBe(hash2);
    });

    it('should be order-independent for object fields', () => {
      // Same program, different field order
      const program1 = {
        name: 'test',
        version: '1.0.0',
        steps: [{ type: 'prompt' as const }],
      };

      const program2 = {
        steps: [{ type: 'prompt' as const }],
        version: '1.0.0',
        name: 'test',
      };

      const hash1 = computeProgramFingerprint(program1);
      const hash2 = computeProgramFingerprint(program2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('programsMatch', () => {
    it('should return true for identical programs', () => {
      expect(programsMatch(sampleProgram, { ...sampleProgram })).toBe(true);
    });

    it('should return false for different programs', () => {
      const different: ProgramDefinitionWithLimits = {
        ...sampleProgram,
        name: 'different',
      };
      expect(programsMatch(sampleProgram, different)).toBe(false);
    });
  });

  describe('getProgramCanonicalJson', () => {
    it('should return valid JSON', () => {
      const json = getProgramCanonicalJson(sampleProgram);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should be deterministic', () => {
      const json1 = getProgramCanonicalJson(sampleProgram);
      const json2 = getProgramCanonicalJson(sampleProgram);
      expect(json1).toBe(json2);
    });
  });

  describe('generateProgramId', () => {
    it('should generate short ID from fingerprint', () => {
      const fingerprint = computeProgramFingerprint(sampleProgram);
      const id = generateProgramId(fingerprint);

      expect(id).toMatch(/^prog_[0-9a-f]{8}$/);
    });

    it('should be deterministic', () => {
      const fingerprint = computeProgramFingerprint(sampleProgram);
      const id1 = generateProgramId(fingerprint);
      const id2 = generateProgramId(fingerprint);

      expect(id1).toBe(id2);
    });
  });

  describe('createProgramRecord', () => {
    it('should create complete record', () => {
      const record = createProgramRecord(sampleProgram, '0x1234');

      expect(record.program_id).toMatch(/^prog_/);
      expect(record.fingerprint).toMatch(/^0x[0-9a-f]{64}$/);
      expect(record.program).toEqual(sampleProgram);
      expect(record.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(record.registered_by).toBe('0x1234');
    });
  });
});

describe('Program Validation', () => {
  describe('validateProgram', () => {
    it('should accept valid program', () => {
      const program = {
        name: 'test',
        version: '1.0.0',
        steps: [{ type: 'prompt' }],
      };

      const result = validateProgram(program);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing name', () => {
      const program = {
        version: '1.0.0',
        steps: [{ type: 'prompt' }],
      };

      const result = validateProgram(program);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('should reject missing version', () => {
      const program = {
        name: 'test',
        steps: [{ type: 'prompt' }],
      };

      const result = validateProgram(program);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('should reject empty steps', () => {
      const program = {
        name: 'test',
        version: '1.0.0',
        steps: [],
      };

      const result = validateProgram(program);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('step'))).toBe(true);
    });

    it('should reject invalid step type', () => {
      const program = {
        name: 'test',
        version: '1.0.0',
        steps: [{ type: 'invalid' }],
      };

      const result = validateProgram(program);
      expect(result.valid).toBe(false);
    });

    it('should validate limits', () => {
      const program = {
        name: 'test',
        version: '1.0.0',
        steps: [{ type: 'prompt' }],
        limits: {
          max_llm_calls: -1, // Invalid
          max_total_tokens: 1000,
          max_execution_ms: 30000,
        },
      };

      const result = validateProgram(program);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('max_llm_calls'))).toBe(true);
    });

    it('should warn about missing description', () => {
      const program = {
        name: 'test',
        version: '1.0.0',
        steps: [{ type: 'prompt' }],
      };

      const result = validateProgram(program);
      expect(result.warnings.some((w) => w.includes('description'))).toBe(true);
    });
  });

  describe('isProgramDefinition', () => {
    it('should return true for valid program', () => {
      const program = {
        name: 'test',
        version: '1.0.0',
        steps: [{ type: 'prompt' }],
      };

      expect(isProgramDefinition(program)).toBe(true);
    });

    it('should return false for invalid program', () => {
      expect(isProgramDefinition({})).toBe(false);
      expect(isProgramDefinition(null)).toBe(false);
      expect(isProgramDefinition('string')).toBe(false);
    });
  });
});

describe('Default Metering Limits', () => {
  it('should have expected values', () => {
    expect(DEFAULT_METERING_LIMITS.max_llm_calls).toBe(10);
    expect(DEFAULT_METERING_LIMITS.max_total_tokens).toBe(100000);
    expect(DEFAULT_METERING_LIMITS.max_execution_ms).toBe(300000);
    expect(DEFAULT_METERING_LIMITS.max_retrieval_calls).toBe(20);
    expect(DEFAULT_METERING_LIMITS.max_bundle_size_bytes).toBe(5 * 1024 * 1024);
  });
});
