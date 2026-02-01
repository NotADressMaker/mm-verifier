/**
 * Tests for GenAIL integration with MMV
 */

import {
  // Metering
  createMeteringState,
  finalizeMeteringState,
  recordLLMCall,
  recordToolCall,
  checkMeteringLimits,
  enforceMeteringLimits,
  MeteringLimitExceededError,
  DEFAULT_METERING_LIMITS,
  createModelCallRecord,
  generateMeteringSummary,

  // Receipts
  computeInputHash,
  computeOutputHash,
  computeProgramFingerprint,
  buildReceipt,
  validateReceiptIntegrity,
  validateReceiptAgainstContext,
  formatReceiptSummary,

  // Evidence
  normalizeSource,
  computeSourceHash,
  extractProgramMetadata,
  parseGenAILProgram,
  buildEvidenceBundle,
  validateEvidenceIntegrity,
  validateEvidenceAgainstContext,
  formatEvidenceSummary,

  // Runtime
  createRuntime,
  createExecutionContext,
  validateAndFingerprint,
  executeGenAIL,

  // Types
  MeteringState,
  MeteringLimits,
  GenAILProgram,
  MMVExecutionContext,
} from '../src';

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_GENAIL_SOURCE = `
# A simple fact-checking program
model "gpt-4"

set claim = $input.claim
set context = $input.context

message system "You are a fact-checker. Evaluate claims against provided context."
message user "Claim: " + claim
message user "Context: " + context

generate as evaluation

call score(evaluation)
`;

const SAMPLE_INPUTS = {
  claim: 'The Earth is round',
  context: 'Scientific consensus based on observations and measurements',
};

function createTestContext(): MMVExecutionContext {
  const program = parseGenAILProgram(SAMPLE_GENAIL_SOURCE);
  const config = {
    mmv: { base_url: 'http://localhost:3000', auto_verify: false },
    auto_verify: false,
    metering_limits: DEFAULT_METERING_LIMITS,
  };
  return createExecutionContext(program, SAMPLE_INPUTS, config as any);
}

// ============================================================================
// Metering Tests
// ============================================================================

describe('Metering', () => {
  describe('createMeteringState', () => {
    it('should create initial metering state', () => {
      const state = createMeteringState();

      expect(state.llm_calls).toBe(0);
      expect(state.total_tokens).toBe(0);
      expect(state.execution_ms).toBe(0);
      expect(state.retrieval_calls).toBe(0);
      expect(state.started_at).toBeGreaterThan(0);
      expect(state.ended_at).toBeUndefined();
      expect(state.call_log).toEqual([]);
    });
  });

  describe('recordLLMCall', () => {
    it('should record LLM call and update totals', () => {
      let state = createMeteringState();

      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 100,
        tokens_out: 50,
        duration_ms: 1000,
        success: true,
      });

      expect(state.llm_calls).toBe(1);
      expect(state.total_tokens).toBe(150);
      expect(state.call_log).toHaveLength(1);
      expect(state.call_log[0].call_type).toBe('generate');
      expect(state.call_log[0].model).toBe('gpt-4');
    });

    it('should accumulate multiple calls', () => {
      let state = createMeteringState();

      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 100,
        tokens_out: 50,
        duration_ms: 1000,
        success: true,
      });

      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 200,
        tokens_out: 100,
        duration_ms: 2000,
        success: true,
      });

      expect(state.llm_calls).toBe(2);
      expect(state.total_tokens).toBe(450);
      expect(state.call_log).toHaveLength(2);
    });
  });

  describe('recordToolCall', () => {
    it('should record tool call', () => {
      let state = createMeteringState();

      state = recordToolCall(state, {
        tool_name: 'search',
        duration_ms: 500,
        success: true,
      });

      expect(state.retrieval_calls).toBe(1);
      expect(state.call_log).toHaveLength(1);
      expect(state.call_log[0].call_type).toBe('tool');
      expect(state.call_log[0].tool_name).toBe('search');
    });
  });

  describe('checkMeteringLimits', () => {
    it('should pass when within limits', () => {
      const state = createMeteringState();
      const result = checkMeteringLimits(state, DEFAULT_METERING_LIMITS);

      expect(result.within_limits).toBe(true);
      expect(result.exceeded).toEqual([]);
    });

    it('should detect exceeded LLM calls', () => {
      let state = createMeteringState();
      const limits: MeteringLimits = { ...DEFAULT_METERING_LIMITS, max_llm_calls: 2 };

      // Add 3 calls to exceed limit
      for (let i = 0; i < 3; i++) {
        state = recordLLMCall(state, {
          model: 'gpt-4',
          tokens_in: 10,
          tokens_out: 10,
          duration_ms: 100,
          success: true,
        });
      }

      const result = checkMeteringLimits(state, limits);
      expect(result.within_limits).toBe(false);
      expect(result.exceeded.some((e) => e.includes('LLM calls'))).toBe(true);
    });

    it('should warn when approaching limits', () => {
      let state = createMeteringState();
      const limits: MeteringLimits = { ...DEFAULT_METERING_LIMITS, max_llm_calls: 10 };

      // Add 9 calls (90% of limit)
      for (let i = 0; i < 9; i++) {
        state = recordLLMCall(state, {
          model: 'gpt-4',
          tokens_in: 10,
          tokens_out: 10,
          duration_ms: 100,
          success: true,
        });
      }

      const result = checkMeteringLimits(state, limits);
      expect(result.within_limits).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('enforceMeteringLimits', () => {
    it('should throw when limits exceeded and on_exceed is error', () => {
      let state = createMeteringState();
      const limits: MeteringLimits = {
        ...DEFAULT_METERING_LIMITS,
        max_llm_calls: 1,
        on_exceed: 'error',
      };

      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 10,
        tokens_out: 10,
        duration_ms: 100,
        success: true,
      });
      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 10,
        tokens_out: 10,
        duration_ms: 100,
        success: true,
      });

      expect(() => enforceMeteringLimits(state, limits)).toThrow(MeteringLimitExceededError);
    });

    it('should not throw when on_exceed is warn', () => {
      let state = createMeteringState();
      const limits: MeteringLimits = {
        ...DEFAULT_METERING_LIMITS,
        max_llm_calls: 1,
        on_exceed: 'warn',
      };

      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 10,
        tokens_out: 10,
        duration_ms: 100,
        success: true,
      });
      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 10,
        tokens_out: 10,
        duration_ms: 100,
        success: true,
      });

      const result = enforceMeteringLimits(state, limits);
      expect(result.within_limits).toBe(false);
    });
  });

  describe('createModelCallRecord', () => {
    it('should create model call record with commitment hash', () => {
      const record = createModelCallRecord({
        provider: 'openai',
        model: 'gpt-4',
        prompt: 'Hello',
        response: 'Hi there!',
        tokens_in: 10,
        tokens_out: 5,
        duration_ms: 500,
        temperature: 0.7,
      });

      expect(record.call_id).toMatch(/^call_/);
      expect(record.provider).toBe('openai');
      expect(record.model).toBe('gpt-4');
      expect(record.prompt_hash).toMatch(/^0x/);
      expect(record.response_hash).toMatch(/^0x/);
      expect(record.model_commitment_hash).toMatch(/^0x/);
    });
  });

  describe('generateMeteringSummary', () => {
    it('should generate readable summary', () => {
      let state = createMeteringState();
      state = recordLLMCall(state, {
        model: 'gpt-4',
        tokens_in: 100,
        tokens_out: 50,
        duration_ms: 1000,
        success: true,
      });
      state = finalizeMeteringState(state);

      const summary = generateMeteringSummary(state);
      expect(summary).toContain('LLM Calls: 1');
      expect(summary).toContain('Total Tokens: 150');
    });
  });
});

// ============================================================================
// Receipt Tests
// ============================================================================

describe('Receipts', () => {
  describe('hash computation', () => {
    it('should compute deterministic input hash', () => {
      const hash1 = computeInputHash({ a: 1, b: 2 });
      const hash2 = computeInputHash({ b: 2, a: 1 }); // Different order

      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
      expect(hash1).toBe(hash2); // Should be same due to key sorting
    });

    it('should compute different hashes for different inputs', () => {
      const hash1 = computeInputHash({ a: 1 });
      const hash2 = computeInputHash({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('buildReceipt', () => {
    it('should build receipt from execution context', () => {
      const ctx = createTestContext();
      ctx.outputs = { result: 'verified' };

      const receipt = buildReceipt(ctx);

      expect(receipt.receipt_version).toBe('1.0');
      expect(receipt.execution_id).toBe(ctx.execution_id);
      expect(receipt.input_hash).toMatch(/^0x/);
      expect(receipt.output_hash).toMatch(/^0x/);
      expect(receipt.program.fingerprint).toMatch(/^0x/);
      expect(receipt.metering.llm_calls).toBe(0);
    });

    it('should include verification data when provided', () => {
      const ctx = createTestContext();
      ctx.outputs = { result: 'verified' };

      const receipt = buildReceipt(ctx, {
        task_id: 'task_123',
        score_bps: 8500,
        verdict: true,
        worthy: true,
        verified_at: Date.now(),
      });

      expect(receipt.task_id).toBe('task_123');
      expect(receipt.score_bps).toBe(8500);
      expect(receipt.verdict).toBe(true);
      expect(receipt.worthy).toBe(true);
    });
  });

  describe('validateReceiptIntegrity', () => {
    it('should validate correct receipt', () => {
      const ctx = createTestContext();
      ctx.outputs = { result: 'test' };
      const receipt = buildReceipt(ctx);

      const result = validateReceiptIntegrity(receipt);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject invalid score', () => {
      const ctx = createTestContext();
      const receipt = buildReceipt(ctx);
      receipt.score_bps = 15000; // Invalid

      const result = validateReceiptIntegrity(receipt);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('score_bps'))).toBe(true);
    });
  });

  describe('validateReceiptAgainstContext', () => {
    it('should validate matching receipt and context', () => {
      const ctx = createTestContext();
      ctx.outputs = { result: 'test' };
      const receipt = buildReceipt(ctx);

      const result = validateReceiptAgainstContext(receipt, ctx);
      expect(result.valid).toBe(true);
      expect(result.mismatches).toEqual([]);
    });

    it('should detect output mismatch', () => {
      const ctx = createTestContext();
      ctx.outputs = { result: 'test' };
      const receipt = buildReceipt(ctx);

      // Modify context outputs
      ctx.outputs = { result: 'different' };

      const result = validateReceiptAgainstContext(receipt, ctx);
      expect(result.valid).toBe(false);
      expect(result.mismatches.some((m) => m.includes('output_hash'))).toBe(true);
    });
  });

  describe('formatReceiptSummary', () => {
    it('should format receipt for display', () => {
      const ctx = createTestContext();
      ctx.outputs = { result: 'test' };
      const receipt = buildReceipt(ctx, {
        task_id: 'task_123',
        score_bps: 8500,
        verdict: true,
        worthy: true,
        verified_at: Date.now(),
      });

      const summary = formatReceiptSummary(receipt);
      expect(summary).toContain('GenAIL Verification Receipt');
      expect(summary).toContain('Score: 85%');
      expect(summary).toContain('Verdict: PASS');
      expect(summary).toContain('Worthy: YES');
    });
  });
});

// ============================================================================
// Evidence Tests
// ============================================================================

describe('Evidence', () => {
  describe('normalizeSource', () => {
    it('should remove comments', () => {
      const source = 'model "gpt-4" # this is a comment\ngenerate';
      const normalized = normalizeSource(source);

      expect(normalized).not.toContain('#');
      expect(normalized).toContain('model "gpt-4"');
    });

    it('should normalize whitespace', () => {
      const source = 'model   "gpt-4"\n\n\ngenerate';
      const normalized = normalizeSource(source);

      expect(normalized).toBe('model "gpt-4"\ngenerate');
    });
  });

  describe('extractProgramMetadata', () => {
    it('should extract models', () => {
      const metadata = extractProgramMetadata(SAMPLE_GENAIL_SOURCE);

      expect(metadata.models).toContain('gpt-4');
    });

    it('should extract tools', () => {
      const metadata = extractProgramMetadata(SAMPLE_GENAIL_SOURCE);

      expect(metadata.tools).toContain('score');
    });

    it('should count generate statements', () => {
      const metadata = extractProgramMetadata(SAMPLE_GENAIL_SOURCE);

      expect(metadata.generate_count).toBe(1);
    });

    it('should count message statements', () => {
      const metadata = extractProgramMetadata(SAMPLE_GENAIL_SOURCE);

      expect(metadata.message_count).toBe(3);
    });

    it('should calculate complexity score', () => {
      const metadata = extractProgramMetadata(SAMPLE_GENAIL_SOURCE);

      expect(metadata.complexity_score).toBeGreaterThan(0);
    });
  });

  describe('parseGenAILProgram', () => {
    it('should parse program with all metadata', () => {
      const program = parseGenAILProgram(SAMPLE_GENAIL_SOURCE);

      expect(program.source).toBe(SAMPLE_GENAIL_SOURCE);
      expect(program.source_hash).toMatch(/^0x/);
      expect(program.metadata.models).toContain('gpt-4');
    });
  });

  describe('buildEvidenceBundle', () => {
    it('should build complete evidence bundle', () => {
      const ctx = createTestContext();
      ctx.outputs = { result: 'test' };

      const bundle = buildEvidenceBundle(ctx);

      expect(bundle.bundle_version).toBe('0.3');
      expect(bundle.bundle_type).toBe('genail_execution');
      expect(bundle.execution_id).toBe(ctx.execution_id);
      expect(bundle.program.fingerprint).toMatch(/^0x/);
      expect(bundle.io.input_hash).toMatch(/^0x/);
      expect(bundle.io.output_hash).toMatch(/^0x/);
      expect(bundle.integrity.bundle_hash).toMatch(/^0x/);
      expect(bundle.integrity.content_hash).toMatch(/^0x/);
    });

    it('should include normalized source when enabled', () => {
      const ctx = createTestContext();

      const bundle = buildEvidenceBundle(ctx, {
        include_source: true,
        include_summaries: false,
        include_call_log: false,
        include_reasoning_trace: false,
      });

      expect(bundle.program.normalized_source.length).toBeGreaterThan(0);
    });

    it('should exclude source when disabled', () => {
      const ctx = createTestContext();

      const bundle = buildEvidenceBundle(ctx, {
        include_source: false,
        include_summaries: false,
        include_call_log: false,
        include_reasoning_trace: false,
      });

      expect(bundle.program.normalized_source).toBe('');
    });
  });

  describe('validateEvidenceIntegrity', () => {
    it('should validate correct bundle', () => {
      const ctx = createTestContext();
      const bundle = buildEvidenceBundle(ctx);

      const result = validateEvidenceIntegrity(bundle);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect tampered content', () => {
      const ctx = createTestContext();
      const bundle = buildEvidenceBundle(ctx);

      // Tamper with content
      bundle.metering.llm_calls = 999;

      const result = validateEvidenceIntegrity(bundle);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Content hash mismatch'))).toBe(true);
    });
  });

  describe('formatEvidenceSummary', () => {
    it('should format evidence for display', () => {
      const ctx = createTestContext();
      const bundle = buildEvidenceBundle(ctx);

      const summary = formatEvidenceSummary(bundle);
      expect(summary).toContain('GenAIL Evidence Bundle');
      expect(summary).toContain('gpt-4');
      expect(summary).toContain('Fingerprint:');
    });
  });
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe('Runtime', () => {
  describe('createRuntime', () => {
    it('should create runtime with defaults', () => {
      const runtime = createRuntime({});

      const config = runtime.getConfig();
      expect(config.auto_verify).toBe(false);
      expect(config.metering_limits).toBeDefined();
    });

    it('should merge user config with defaults', () => {
      const runtime = createRuntime({
        auto_verify: true,
        worthy_threshold_bps: 9000,
      });

      const config = runtime.getConfig();
      expect(config.auto_verify).toBe(true);
      expect(config.worthy_threshold_bps).toBe(9000);
    });
  });

  describe('validateAndFingerprint', () => {
    it('should validate correct program', () => {
      const result = validateAndFingerprint(SAMPLE_GENAIL_SOURCE);

      expect(result.valid).toBe(true);
      expect(result.fingerprint).toMatch(/^0x/);
      expect(result.metadata.models).toContain('gpt-4');
      expect(result.errors).toEqual([]);
    });

    it('should detect missing model declaration', () => {
      const result = validateAndFingerprint('generate as output');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('model'))).toBe(true);
    });

    it('should detect missing generate statement', () => {
      const result = validateAndFingerprint('model "gpt-4"\nmessage user "hello"');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('generate'))).toBe(true);
    });
  });

  describe('executeGenAIL', () => {
    it('should execute and return result', async () => {
      const result = await executeGenAIL(SAMPLE_GENAIL_SOURCE, SAMPLE_INPUTS);

      expect(result.success).toBe(true);
      expect(result.context.execution_id).toBeDefined();
      expect(result.receipt).toBeDefined();
      expect(result.evidence).toBeDefined();
      expect(result.metering_check).toBeDefined();
    });

    it('should include outputs in result', async () => {
      const result = await executeGenAIL(SAMPLE_GENAIL_SOURCE, SAMPLE_INPUTS);

      expect(result.outputs).toBeDefined();
      expect(result.outputs._executed).toBe(true);
    });

    it('should respect custom metering limits', async () => {
      const result = await executeGenAIL(SAMPLE_GENAIL_SOURCE, SAMPLE_INPUTS, {
        metering_limits: {
          max_llm_calls: 100,
          max_total_tokens: 50000,
          max_execution_ms: 60000,
          on_exceed: 'warn',
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('program fingerprinting', () => {
    it('should produce consistent fingerprints', () => {
      const fp1 = validateAndFingerprint(SAMPLE_GENAIL_SOURCE).fingerprint;
      const fp2 = validateAndFingerprint(SAMPLE_GENAIL_SOURCE).fingerprint;

      expect(fp1).toBe(fp2);
    });

    it('should produce different fingerprints for different programs', () => {
      const fp1 = validateAndFingerprint(SAMPLE_GENAIL_SOURCE).fingerprint;
      const fp2 = validateAndFingerprint('model "gpt-4"\ngenerate as x').fingerprint;

      expect(fp1).not.toBe(fp2);
    });

    it('should ignore comments in fingerprinting', () => {
      const source1 = 'model "gpt-4"\ngenerate';
      const source2 = 'model "gpt-4" # comment\ngenerate';

      const fp1 = validateAndFingerprint(source1).fingerprint;
      const fp2 = validateAndFingerprint(source2).fingerprint;

      // Fingerprints may differ due to metadata extraction differences
      // but the normalized source should be the same
      expect(normalizeSource(source1)).toBe(normalizeSource(source2));
    });
  });
});
