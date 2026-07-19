import {
  VerificationReceipt,
  RECEIPT_VERSION,
  computeReceiptHash,
  getReceiptCanonicalJson,
  buildReceipt,
  attachChainContext,
  attachSignature,
  validateReceipt,
  isVerificationReceipt,
  receiptsMatch,
  verifyReceiptHash,
} from '../../shared/receipt';

describe('VerificationReceipt', () => {
  const sampleReceipt: VerificationReceipt = {
    schema_version: '1',
    version: '1.0.0',
    receipt_version: '1.0.0',
    task_id: '12345',
    generated_at: 1705320000,
    input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
    output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
    score_bps: 8500,
    verdict: true,
    worthy: true,
    evidence: {
      bundle_hash: '0x' + '33'.repeat(32) as `0x${string}`,
      bundle_uri: 'ipfs://QmTestBundle',
      bundle_version: '0.2',
    },
    provenance: {
      llm_provider: 'openai',
      llm_model: 'gpt-4',
      verifier_node: 'node-1',
    },
    explain: {
      version: '1.0.0',
      score_components: [],
      score_components_detail: {
        coverage_bps: 0,
        contradiction_penalty_bps: 0,
        citation_quality_bps: 0,
        final_score_bps: 0,
      },
      claim_summary: [],
      highlights: [],
      checks: {},
      checks_fired: [],
      uncertain_claims: [],
      score_adjustments: [],
      contradictions_found: [],
      citation_checks: [],
      model_disagreement: {
        models: [],
        agreement_rate: 0,
      },
    },
  };

  describe('computeReceiptHash', () => {
    it('should produce deterministic hash', () => {
      const hash1 = computeReceiptHash(sampleReceipt);
      const hash2 = computeReceiptHash(sampleReceipt);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should differ for different task IDs', () => {
      const receipt2: VerificationReceipt = {
        ...sampleReceipt,
        task_id: '54321',
      };

      const hash1 = computeReceiptHash(sampleReceipt);
      const hash2 = computeReceiptHash(receipt2);

      expect(hash1).not.toBe(hash2);
    });

    it('should differ for different scores', () => {
      const receipt2: VerificationReceipt = {
        ...sampleReceipt,
        score_bps: 7000,
        worthy: false,
      };

      const hash1 = computeReceiptHash(sampleReceipt);
      const hash2 = computeReceiptHash(receipt2);

      expect(hash1).not.toBe(hash2);
    });

    it('should not include chain_context in hash', () => {
      const receiptWithContext = attachChainContext(sampleReceipt, {
        chain_id: 421614,
        contract_address: '0x' + '44'.repeat(20) as `0x${string}`,
        finalized_at: 1705320100,
        block_number: 12345678,
        tx_hash: '0x' + '55'.repeat(32) as `0x${string}`,
      });

      const hash1 = computeReceiptHash(sampleReceipt);
      const hash2 = computeReceiptHash(receiptWithContext);

      expect(hash1).toBe(hash2);
    });

    it('should not include signature in hash', () => {
      const receiptWithSig = attachSignature(sampleReceipt, {
        signer: '0x' + '66'.repeat(20) as `0x${string}`,
        signature: '0x' + '77'.repeat(65) as `0x${string}`,
        signed_at: 1705320050,
      });

      const hash1 = computeReceiptHash(sampleReceipt);
      const hash2 = computeReceiptHash(receiptWithSig);

      expect(hash1).toBe(hash2);
    });

    it('binds a material verification-context change', () => {
      const contextual = {
        ...sampleReceipt,
        context_version: 'context-v1' as const,
        verification_context: {
          verification_program_id: 'factual-consensus', verification_program_version: '1.0.0', verification_program_fingerprint: '0x' + 'aa'.repeat(32),
          evidence_scope: 'submitted sources', policy_thresholds: { coverage: 0.8 }, source_independence_rules: { distinct_domains: true }, run_timestamp: '2026-07-19T00:00:00.000Z',
        },
      };
      expect(computeReceiptHash(contextual)).not.toBe(computeReceiptHash({ ...contextual, verification_context: { ...contextual.verification_context, evidence_scope: 'regulatory sources only' } }));
    });
  });

  describe('buildReceipt', () => {
    it('should create valid receipt', () => {
      const receipt = buildReceipt({
        task_id: '12345',
        input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
        output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
        score_bps: 8500,
        bundle_hash: '0x' + '33'.repeat(32) as `0x${string}`,
        bundle_uri: 'ipfs://QmTest',
        llm_provider: 'openai',
        llm_model: 'gpt-4',
      });

      expect(receipt.receipt_version).toBe(RECEIPT_VERSION);
      expect(receipt.version).toBe(RECEIPT_VERSION);
      expect(receipt.task_id).toBe('12345');
      expect(receipt.score_bps).toBe(8500);
      expect(receipt.verdict).toBe(true);
      expect(receipt.worthy).toBe(true);
    });

    it('should set verdict based on score', () => {
      // High score - pass
      const highReceipt = buildReceipt({
        task_id: '1',
        input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
        output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
        score_bps: 8000,
        bundle_hash: '0x' + '33'.repeat(32) as `0x${string}`,
        bundle_uri: 'ipfs://Qm1',
        llm_provider: 'openai',
        llm_model: 'gpt-4',
      });
      expect(highReceipt.verdict).toBe(true);
      expect(highReceipt.worthy).toBe(true);

      // Medium score - pass but not worthy
      const medReceipt = buildReceipt({
        task_id: '2',
        input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
        output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
        score_bps: 6000,
        bundle_hash: '0x' + '33'.repeat(32) as `0x${string}`,
        bundle_uri: 'ipfs://Qm2',
        llm_provider: 'openai',
        llm_model: 'gpt-4',
      });
      expect(medReceipt.verdict).toBe(true);
      expect(medReceipt.worthy).toBe(false);

      // Low score - fail
      const lowReceipt = buildReceipt({
        task_id: '3',
        input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
        output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
        score_bps: 4000,
        bundle_hash: '0x' + '33'.repeat(32) as `0x${string}`,
        bundle_uri: 'ipfs://Qm3',
        llm_provider: 'openai',
        llm_model: 'gpt-4',
      });
      expect(lowReceipt.verdict).toBe(false);
      expect(lowReceipt.worthy).toBe(false);
    });

    it('should include program reference', () => {
      const receipt = buildReceipt({
        task_id: '12345',
        input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
        output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
        score_bps: 8500,
        bundle_hash: '0x' + '33'.repeat(32) as `0x${string}`,
        bundle_uri: 'ipfs://QmTest',
        llm_provider: 'openai',
        llm_model: 'gpt-4',
        program: {
          name: 'test-program',
          version: '1.0.0',
          steps: [{ type: 'prompt' }],
          scoring: {
            method: 'weighted_sum',
            components: [{ id: 'consistency', weight_bps: 10000 }],
          },
          thresholds: { pass_bps: 5000, worthy_bps: 8000 },
          receipt: { schema_version: '1', receipt_version: '1.0.0', explain_version: '1.0.0' },
        },
      });

      expect(receipt.program).toBeDefined();
      expect(receipt.program?.id).toMatch(/^prog_/);
      expect(receipt.program?.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should include metering', () => {
      const receipt = buildReceipt({
        task_id: '12345',
        input_hash: '0x' + '11'.repeat(32) as `0x${string}`,
        output_hash: '0x' + '22'.repeat(32) as `0x${string}`,
        score_bps: 8500,
        bundle_hash: '0x' + '33'.repeat(32) as `0x${string}`,
        bundle_uri: 'ipfs://QmTest',
        llm_provider: 'openai',
        llm_model: 'gpt-4',
        metering: {
          llm_calls: 3,
          total_tokens: 5000,
          execution_ms: 15000,
        },
      });

      expect(receipt.metering).toBeDefined();
      expect(receipt.metering?.llm_calls).toBe(3);
      expect(receipt.metering?.total_tokens).toBe(5000);
    });
  });

  describe('attachChainContext', () => {
    it('should attach chain context', () => {
      const updated = attachChainContext(sampleReceipt, {
        chain_id: 421614,
        contract_address: '0x' + '44'.repeat(20) as `0x${string}`,
        finalized_at: 1705320100,
        block_number: 12345678,
        tx_hash: '0x' + '55'.repeat(32) as `0x${string}`,
      });

      expect(updated.chain_context).toBeDefined();
      expect(updated.chain_context?.chain_id).toBe(421614);
      expect(updated.chain_context?.block_number).toBe(12345678);
    });

    it('should not mutate original receipt', () => {
      attachChainContext(sampleReceipt, {
        chain_id: 421614,
        contract_address: '0x' + '44'.repeat(20) as `0x${string}`,
        finalized_at: 1705320100,
        block_number: 12345678,
        tx_hash: '0x' + '55'.repeat(32) as `0x${string}`,
      });

      expect(sampleReceipt.chain_context).toBeUndefined();
    });
  });

  describe('validateReceipt', () => {
    it('should accept valid receipt', () => {
      const result = validateReceipt(sampleReceipt);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid version', () => {
      const invalid = { ...sampleReceipt, receipt_version: '2.0' };
      const result = validateReceipt(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('receipt_version'))).toBe(true);
    });

    it('should reject missing task_id', () => {
      const invalid = { ...sampleReceipt } as any;
      delete invalid.task_id;
      const result = validateReceipt(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('task_id'))).toBe(true);
    });

    it('should reject invalid hash format', () => {
      const invalid = { ...sampleReceipt, input_hash: 'not-a-hash' };
      const result = validateReceipt(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('input_hash'))).toBe(true);
    });

    it('should reject score out of range', () => {
      const invalid = { ...sampleReceipt, score_bps: 15000 };
      const result = validateReceipt(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('score_bps'))).toBe(true);
    });

    it('should reject non-object', () => {
      expect(validateReceipt(null).valid).toBe(false);
      expect(validateReceipt('string').valid).toBe(false);
      expect(validateReceipt(123).valid).toBe(false);
    });

    it('requires a populated context for context-v1 receipts', () => {
      expect(validateReceipt({ ...sampleReceipt, context_version: 'context-v1' }).errors).toContain('verification_context is required for context-v1 receipts');
    });
  });

  describe('isVerificationReceipt', () => {
    it('should return true for valid receipt', () => {
      expect(isVerificationReceipt(sampleReceipt)).toBe(true);
    });

    it('should return false for invalid receipt', () => {
      expect(isVerificationReceipt({})).toBe(false);
      expect(isVerificationReceipt(null)).toBe(false);
    });
  });

  describe('receiptsMatch', () => {
    it('should return true for identical receipts', () => {
      const copy = { ...sampleReceipt };
      expect(receiptsMatch(sampleReceipt, copy)).toBe(true);
    });

    it('should return false for different receipts', () => {
      const different = { ...sampleReceipt, score_bps: 7000 };
      expect(receiptsMatch(sampleReceipt, different as VerificationReceipt)).toBe(false);
    });
  });

  describe('verifyReceiptHash', () => {
    it('should return true for matching hash', () => {
      const hash = computeReceiptHash(sampleReceipt);
      expect(verifyReceiptHash(sampleReceipt, hash)).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const wrongHash = '0x' + 'ff'.repeat(32) as `0x${string}`;
      expect(verifyReceiptHash(sampleReceipt, wrongHash)).toBe(false);
    });
  });

  describe('getReceiptCanonicalJson', () => {
    it('should return valid JSON', () => {
      const json = getReceiptCanonicalJson(sampleReceipt);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should be deterministic', () => {
      const json1 = getReceiptCanonicalJson(sampleReceipt);
      const json2 = getReceiptCanonicalJson(sampleReceipt);
      expect(json1).toBe(json2);
    });
  });
});

describe('Receipt Constants', () => {
  it('should have correct version', () => {
    expect(RECEIPT_VERSION).toBe('1.0.0');
  });
});
