import {
  ReasoningTraceStep,
  ReasoningTraceCommitment,
  hashReasoningStep,
  computeTraceHash,
  buildReasoningTraceCommitment,
  ModelCommitment,
  ModelCommitmentData,
  InferenceConfig,
  computeModelCommitment,
  verifyModelCommitment,
  validateReasoningTrace,
  validateModelCommitment,
  ZKProofAttachment,
  hasZKProof,
} from '../../shared/transparency';

describe('Reasoning Trace Commitments', () => {
  describe('hashReasoningStep', () => {
    it('should produce deterministic hash for same content', () => {
      const content = 'This is a reasoning step about AI verification.';
      const hash1 = hashReasoningStep(content);
      const hash2 = hashReasoningStep(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce different hash for different content', () => {
      const hash1 = hashReasoningStep('First reasoning step');
      const hash2 = hashReasoningStep('Second reasoning step');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashReasoningStep('');
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should handle unicode content', () => {
      const hash = hashReasoningStep('Unicode: 你好世界 🌍');
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('computeTraceHash', () => {
    it('should produce deterministic hash from steps', () => {
      const steps: ReasoningTraceStep[] = [
        { step_id: 'step_1', thought_hash: '0x' + '11'.repeat(32) as `0x${string}` },
        { step_id: 'step_2', thought_hash: '0x' + '22'.repeat(32) as `0x${string}` },
      ];

      const hash1 = computeTraceHash(steps);
      const hash2 = computeTraceHash(steps);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should differ for different step order', () => {
      const stepsA: ReasoningTraceStep[] = [
        { step_id: 'step_1', thought_hash: '0x' + '11'.repeat(32) as `0x${string}` },
        { step_id: 'step_2', thought_hash: '0x' + '22'.repeat(32) as `0x${string}` },
      ];
      const stepsB: ReasoningTraceStep[] = [
        { step_id: 'step_2', thought_hash: '0x' + '22'.repeat(32) as `0x${string}` },
        { step_id: 'step_1', thought_hash: '0x' + '11'.repeat(32) as `0x${string}` },
      ];

      const hashA = computeTraceHash(stepsA);
      const hashB = computeTraceHash(stepsB);

      expect(hashA).not.toBe(hashB);
    });
  });

  describe('buildReasoningTraceCommitment', () => {
    it('should build valid trace commitment', () => {
      const rawSteps = [
        {
          step_id: 'step_1',
          content: 'Analyzing input for verification',
          summary: 'Input analysis',
          step_type: 'observation' as const,
        },
        {
          step_id: 'step_2',
          content: 'Cross-checking model responses',
          summary: 'Cross-check',
          confidence: 0.85,
          step_type: 'verification' as const,
        },
      ];

      const trace = buildReasoningTraceCommitment(rawSteps);

      expect(trace.trace_version).toBe('1.0');
      expect(trace.steps).toHaveLength(2);
      expect(trace.trace_hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(trace.generated_at).toBeGreaterThan(0);

      // Check step hashes are deterministic
      const step1Hash = hashReasoningStep('Analyzing input for verification');
      expect(trace.steps[0].thought_hash).toBe(step1Hash);
    });

    it('should include trace URI when provided', () => {
      const trace = buildReasoningTraceCommitment(
        [{ step_id: 's1', content: 'test' }],
        'ipfs://QmTestTrace'
      );

      expect(trace.trace_uri).toBe('ipfs://QmTestTrace');
    });
  });

  describe('validateReasoningTrace', () => {
    const validTrace: ReasoningTraceCommitment = {
      trace_version: '1.0',
      steps: [
        { step_id: 'step_1', thought_hash: '0x' + '11'.repeat(32) as `0x${string}` },
      ],
      trace_hash: '0x' + '33'.repeat(32) as `0x${string}`,
      generated_at: Math.floor(Date.now() / 1000),
    };

    it('should accept valid trace', () => {
      const result = validateReasoningTrace(validTrace);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid version', () => {
      const invalid = { ...validTrace, trace_version: '2.0' };
      const result = validateReasoningTrace(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('trace_version'))).toBe(true);
    });

    it('should reject invalid thought_hash format', () => {
      const invalid = {
        ...validTrace,
        steps: [{ step_id: 'step_1', thought_hash: 'not-a-hash' }],
      };
      const result = validateReasoningTrace(invalid);
      expect(result.valid).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateReasoningTrace(null).valid).toBe(false);
      expect(validateReasoningTrace('string').valid).toBe(false);
    });
  });
});

describe('Model Commitment', () => {
  const sampleData: ModelCommitmentData = {
    provider: 'openai',
    model: 'gpt-4',
    version: '0613',
    inference_config: {
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 1.0,
    },
  };

  describe('computeModelCommitment', () => {
    it('should produce deterministic commitment hash', () => {
      const commitment1 = computeModelCommitment(sampleData);
      const commitment2 = computeModelCommitment(sampleData);

      expect(commitment1.model_commitment_hash).toBe(commitment2.model_commitment_hash);
      expect(commitment1.model_commitment_hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce different hash for different providers', () => {
      const dataAnthropic = { ...sampleData, provider: 'anthropic' };
      const hashOpenAI = computeModelCommitment(sampleData);
      const hashAnthropic = computeModelCommitment(dataAnthropic);

      expect(hashOpenAI.model_commitment_hash).not.toBe(
        hashAnthropic.model_commitment_hash
      );
    });

    it('should produce different hash for different models', () => {
      const dataGPT35 = { ...sampleData, model: 'gpt-3.5-turbo' };
      const hashGPT4 = computeModelCommitment(sampleData);
      const hashGPT35 = computeModelCommitment(dataGPT35);

      expect(hashGPT4.model_commitment_hash).not.toBe(
        hashGPT35.model_commitment_hash
      );
    });

    it('should produce different hash for different configs', () => {
      const dataLowTemp = {
        ...sampleData,
        inference_config: { ...sampleData.inference_config, temperature: 0.1 },
      };
      const hashDefault = computeModelCommitment(sampleData);
      const hashLowTemp = computeModelCommitment(dataLowTemp);

      expect(hashDefault.model_commitment_hash).not.toBe(
        hashLowTemp.model_commitment_hash
      );
    });

    it('should compute separate inference_config_hash', () => {
      const commitment = computeModelCommitment(sampleData);

      expect(commitment.inference_config_hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(commitment.inference_config_hash).not.toBe(
        commitment.model_commitment_hash
      );
    });

    it('should handle missing inference config', () => {
      const dataNoConfig: ModelCommitmentData = {
        provider: 'openai',
        model: 'gpt-4',
      };
      const commitment = computeModelCommitment(dataNoConfig);

      expect(commitment.model_commitment_hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(commitment.inference_config_hash).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('verifyModelCommitment', () => {
    it('should return true for matching data', () => {
      const commitment = computeModelCommitment(sampleData);
      expect(verifyModelCommitment(commitment, sampleData)).toBe(true);
    });

    it('should return false for different data', () => {
      const commitment = computeModelCommitment(sampleData);
      const differentData = { ...sampleData, model: 'gpt-3.5-turbo' };
      expect(verifyModelCommitment(commitment, differentData)).toBe(false);
    });
  });

  describe('validateModelCommitment', () => {
    it('should accept valid commitment', () => {
      const commitment = computeModelCommitment(sampleData);
      const result = validateModelCommitment(commitment);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid hash format', () => {
      const invalid = {
        model_commitment_hash: 'not-a-hash',
        inference_config_hash: '0x' + '11'.repeat(32),
        data: sampleData,
      };
      const result = validateModelCommitment(invalid);
      expect(result.valid).toBe(false);
    });

    it('should reject missing data', () => {
      const invalid = {
        model_commitment_hash: '0x' + '11'.repeat(32),
        inference_config_hash: '0x' + '22'.repeat(32),
      };
      const result = validateModelCommitment(invalid);
      expect(result.valid).toBe(false);
    });
  });
});

describe('ZK Proof Interface', () => {
  describe('hasZKProof', () => {
    it('should return true for valid ZK proof structure', () => {
      const receipt = {
        zk_proof: {
          zk_proof: '0x' + 'ab'.repeat(100),
          zk_public_inputs: {
            input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
            output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
            model_commitment_hash: '0x' + '33'.repeat(32) as `0x${string}`,
            score_bps: 8500,
            bundle_hash: '0x' + '44'.repeat(32) as `0x${string}`,
          },
          proof_system: 'risc_zero' as const,
        } as ZKProofAttachment,
      };

      expect(hasZKProof(receipt)).toBe(true);
    });

    it('should return false for missing zk_proof', () => {
      const receipt = {};
      expect(hasZKProof(receipt)).toBe(false);
    });

    it('should return false for invalid zk_proof format', () => {
      const receipt = {
        zk_proof: {
          zk_proof: 'not-hex',
          zk_public_inputs: {},
        },
      };
      expect(hasZKProof(receipt)).toBe(false);
    });
  });
});

describe('Hash Determinism Across Modules', () => {
  it('should produce same hash for equivalent objects regardless of field order', () => {
    const dataA: ModelCommitmentData = {
      provider: 'openai',
      model: 'gpt-4',
      inference_config: {
        temperature: 0.7,
        max_tokens: 4096,
      },
    };

    const dataB: ModelCommitmentData = {
      model: 'gpt-4',
      provider: 'openai',
      inference_config: {
        max_tokens: 4096,
        temperature: 0.7,
      },
    };

    const hashA = computeModelCommitment(dataA);
    const hashB = computeModelCommitment(dataB);

    expect(hashA.model_commitment_hash).toBe(hashB.model_commitment_hash);
  });

  it('should maintain hash consistency for reasoning trace', () => {
    const content = 'Verifying AI output against multiple sources';

    // Hash multiple times
    const hashes = Array(10)
      .fill(null)
      .map(() => hashReasoningStep(content));

    // All hashes should be identical
    expect(new Set(hashes).size).toBe(1);
  });
});
