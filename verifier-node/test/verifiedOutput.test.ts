import {
  VerifiedOutputRecord,
  buildVerifiedOutputRecord,
  hashVerifiedOutputRecord,
  computeRecordId,
  toEip712Message,
  validateVerifiedOutputRecord,
  calculateBuilderReward,
  matchesFilter,
  DEFAULT_BUILDER_REWARDS_CONFIG,
  BuilderRewardsConfig,
  VerifiedOutputQueryFilter,
} from '../../shared/verifiedOutput';
import { EvidenceBundleV02, CONSTANTS } from '../../shared/types';
import { hashCanonical } from '../../shared/canonicalJson';

// Sample v0.2 evidence bundle for testing
const createSampleBundleV02 = (): EvidenceBundleV02 => ({
  task_id: '12345',
  bundle_version: '0.2',
  created_at: '2024-01-15T12:00:00Z',
  evaluator: {
    node_id: 'node:test-001',
    eth_address: '0x1234567890abcdef1234567890abcdef12345678',
    software: {
      name: 'verifier-node',
      ver: '0.2',
      commit: 'abc123',
    },
  },
  prompt_hash: '0x' + '11'.repeat(32),
  rubric_hash: '0x' + '22'.repeat(32),
  model_runs: [
    {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.0,
      raw_output: 'Test output',
      output_hash: '0x' + '33'.repeat(32),
      timestamp: 1705320000,
      latency_ms: 1500,
    },
  ],
  claims: [],
  metrics: {
    consensus: { agreement: 0.95, clusters: 1 },
    factuality: { supported_claim_ratio: 0.9 },
    citation_quality: { authority_score: 0.8 },
    bias: { sensitive_variance: 0.1 },
    stability: { reask_delta: 0.05 },
  },
  final_score_bps: 8500,
  explanation: 'High quality verification with strong consensus.',
  signatures: {
    bundle_sig_eip712: '0x' + 'aa'.repeat(65),
  },
  input: {
    content_type: 'text',
    content_hash: `0x${'44'.repeat(32)}` as `0x${string}`,
  },
  output: {
    content_type: 'json',
    content_hash: `0x${'55'.repeat(32)}` as `0x${string}`,
  },
  provenance: {
    model_runs: [
      {
        provider: 'openai',
        model: 'gpt-4',
        prompt_hash: `0x${'11'.repeat(32)}` as `0x${string}`,
        response_hash: `0x${'33'.repeat(32)}` as `0x${string}`,
        started_at: 1705319998,
        finished_at: 1705320000,
        latency_ms: 1500,
      },
    ],
    sources: [
      {
        uri: 'https://example.com/source1',
        content_hash: `0x${'66'.repeat(32)}` as `0x${string}`,
        content_type: 'text',
        retrieved_at: 1705319000,
      },
    ],
    environment: {
      verifier_node: 'node:test-001',
      software_commit: 'abc123',
    },
  },
  scoring_trace: {
    rubric_hash: `0x${'22'.repeat(32)}` as `0x${string}`,
    score_bps: 8500,
    verdict: 'reliable',
    breakdown: {
      consistency: 95,
      agreement: 95,
      citation_quality: 80,
      factual_accuracy: 90,
    },
    weights: {
      consistency: 0.25,
      agreement: 0.25,
      citation_quality: 0.25,
      factual_accuracy: 0.25,
    },
    reasoning_hash: `0x${'77'.repeat(32)}` as `0x${string}`,
    generated_at: 1705320000,
  },
});

describe('VerifiedOutputRecord', () => {
  describe('buildVerifiedOutputRecord', () => {
    it('should build valid record from EvidenceBundleV02', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'mmv-factual-qa',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest123',
        chain_id: 421614,
        contract_address: '0xabcdef1234567890abcdef1234567890abcdef12' as `0x${string}`,
      });

      expect(record.record_version).toBe('1');
      expect(record.task_id).toBe('12345');
      expect(record.program_id).toBe('mmv-factual-qa');
      expect(record.program_version).toBe('1.0.0');
      expect(record.input_hash).toBe(bundle.input.content_hash);
      expect(record.output_hash).toBe(bundle.output.content_hash);
      expect(record.score_bps).toBe(8500);
      expect(record.verdict).toBe(true); // score >= 5000
      expect(record.bundle_uri).toBe('ipfs://QmTest123');
      expect(record.chain_id).toBe(421614);
      expect(record.contract_address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });

    it('should extract model run refs from provenance', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      expect(record.model_run_refs).toBeDefined();
      expect(record.model_run_refs?.length).toBe(1);
      expect(record.model_run_refs?.[0]).toBe(`0x${'33'.repeat(32)}`);
    });

    it('should extract source refs from provenance', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      expect(record.source_refs).toBeDefined();
      expect(record.source_refs?.length).toBe(1);
      expect(record.source_refs?.[0]).toBe('https://example.com/source1');
    });

    it('should apply optional tags', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        tags: ['finance', 'factual'],
      });

      expect(record.tags).toEqual(['finance', 'factual']);
    });

    it('should set verdict=false for low scores', () => {
      const bundle = createSampleBundleV02();
      bundle.final_score_bps = 4000; // Below MIXED_THRESHOLD

      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      expect(record.verdict).toBe(false);
    });
  });

  describe('hashVerifiedOutputRecord', () => {
    it('should produce deterministic hash', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        finalized_at: 1705320000, // Fixed timestamp for test
      });

      const hash1 = hashVerifiedOutputRecord(record);
      const hash2 = hashVerifiedOutputRecord(record);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should differ for different records', () => {
      const bundle1 = createSampleBundleV02();
      const bundle2 = createSampleBundleV02();
      bundle2.task_id = '54321';

      const record1 = buildVerifiedOutputRecord({
        bundle: bundle1,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        finalized_at: 1705320000,
      });

      const record2 = buildVerifiedOutputRecord({
        bundle: bundle2,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        finalized_at: 1705320000,
      });

      const hash1 = hashVerifiedOutputRecord(record1);
      const hash2 = hashVerifiedOutputRecord(record2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeRecordId', () => {
    it('should compute deterministic record ID', () => {
      const id1 = computeRecordId('12345', 'mmv-factual-qa', 421614);
      const id2 = computeRecordId('12345', 'mmv-factual-qa', 421614);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should differ for different inputs', () => {
      const id1 = computeRecordId('12345', 'mmv-factual-qa', 421614);
      const id2 = computeRecordId('12346', 'mmv-factual-qa', 421614);
      const id3 = computeRecordId('12345', 'mmv-math-proof', 421614);
      const id4 = computeRecordId('12345', 'mmv-factual-qa', 1);

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).not.toBe(id4);
    });
  });

  describe('toEip712Message', () => {
    it('should convert record to EIP-712 message format', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        finalized_at: 1705320000,
      });

      const message = toEip712Message(record);

      expect(message.taskId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(message.programId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(message.inputHash).toBe(record.input_hash);
      expect(message.outputHash).toBe(record.output_hash);
      expect(message.scoreBps).toBe(8500);
      expect(message.verdict).toBe(true);
      expect(message.bundleHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(message.finalizedAt).toBe(1705320000);
    });

    it('should normalize numeric task_id to bytes32', () => {
      const bundle = createSampleBundleV02();
      bundle.task_id = '999';

      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const message = toEip712Message(record);

      // 999 = 0x3e7, padded to 64 chars
      expect(message.taskId).toBe('0x' + '0'.repeat(61) + '3e7');
    });
  });

  describe('validateVerifiedOutputRecord', () => {
    it('should validate correct record', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest123',
        chain_id: 421614,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const result = validateVerifiedOutputRecord(record);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid record_version', () => {
      const record = {
        record_version: '2' as const, // Invalid
        task_id: '12345',
        program_id: 'test',
        program_version: '1.0.0',
        input_hash: `0x${'11'.repeat(32)}` as `0x${string}`,
        output_hash: `0x${'22'.repeat(32)}` as `0x${string}`,
        score_bps: 8000,
        verdict: true,
        bundle_hash: `0x${'33'.repeat(32)}` as `0x${string}`,
        bundle_uri: 'ipfs://test',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        finalized_at: 1705320000,
      };

      const result = validateVerifiedOutputRecord(record);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('record_version'))).toBe(true);
    });

    it('should reject invalid score_bps', () => {
      const bundle = createSampleBundleV02();
      bundle.final_score_bps = 15000; // Invalid: > 10000

      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest123',
        chain_id: 421614,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const result = validateVerifiedOutputRecord(record);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('score_bps'))).toBe(true);
    });

    it('should reject invalid input_hash format', () => {
      const record: any = {
        record_version: '1',
        task_id: '12345',
        program_id: 'test',
        program_version: '1.0.0',
        input_hash: 'invalid-hash', // Invalid
        output_hash: `0x${'22'.repeat(32)}`,
        score_bps: 8000,
        verdict: true,
        bundle_hash: `0x${'33'.repeat(32)}`,
        bundle_uri: 'ipfs://test',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678',
        finalized_at: 1705320000,
      };

      const result = validateVerifiedOutputRecord(record);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('input_hash'))).toBe(true);
    });
  });

  describe('calculateBuilderReward', () => {
    it('should return zero when rewards disabled', () => {
      const bundle = createSampleBundleV02();
      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const config: BuilderRewardsConfig = {
        ...DEFAULT_BUILDER_REWARDS_CONFIG,
        enabled: false,
      };

      const result = calculateBuilderReward(record, config);

      expect(result.reward).toBe('0');
      expect(result.qualityBonus).toBe(false);
    });

    it('should return zero when below minimum score', () => {
      const bundle = createSampleBundleV02();
      bundle.final_score_bps = 4000; // Below minScoreForRewards

      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const config: BuilderRewardsConfig = {
        ...DEFAULT_BUILDER_REWARDS_CONFIG,
        enabled: true,
        minScoreForRewards: 5000,
      };

      const result = calculateBuilderReward(record, config);

      expect(result.reward).toBe('0');
    });

    it('should apply quality bonus for high scores', () => {
      const bundle = createSampleBundleV02();
      bundle.final_score_bps = 8500; // Above RELIABLE_THRESHOLD

      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const config: BuilderRewardsConfig = {
        enabled: true,
        rewardType: 'points',
        baseRewardPerOutput: '100',
        qualityBonusMultiplier: 1.5,
        minScoreForRewards: 5000,
        maxDailyRewardsPerBuilder: '10000',
      };

      const result = calculateBuilderReward(record, config);

      expect(result.reward).toBe('150'); // 100 * 1.5
      expect(result.qualityBonus).toBe(true);
    });

    it('should return base reward for medium scores', () => {
      const bundle = createSampleBundleV02();
      bundle.final_score_bps = 6000; // Between thresholds

      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test-program',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const config: BuilderRewardsConfig = {
        enabled: true,
        rewardType: 'points',
        baseRewardPerOutput: '100',
        qualityBonusMultiplier: 1.5,
        minScoreForRewards: 5000,
        maxDailyRewardsPerBuilder: '10000',
      };

      const result = calculateBuilderReward(record, config);

      expect(result.reward).toBe('100');
      expect(result.qualityBonus).toBe(false);
    });
  });

  describe('matchesFilter', () => {
    let sampleRecord: VerifiedOutputRecord;

    beforeEach(() => {
      const bundle = createSampleBundleV02();
      sampleRecord = buildVerifiedOutputRecord({
        bundle,
        program_id: 'mmv-factual-qa',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://QmTest',
        chain_id: 421614,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        finalized_at: 1705320000,
        tags: ['finance', 'factual'],
      });
    });

    it('should match empty filter', () => {
      expect(matchesFilter(sampleRecord, {})).toBe(true);
    });

    it('should filter by program_id', () => {
      expect(matchesFilter(sampleRecord, { program_id: 'mmv-factual-qa' })).toBe(true);
      expect(matchesFilter(sampleRecord, { program_id: 'mmv-math-proof' })).toBe(false);
    });

    it('should filter by min_score_bps', () => {
      expect(matchesFilter(sampleRecord, { min_score_bps: 8000 })).toBe(true);
      expect(matchesFilter(sampleRecord, { min_score_bps: 9000 })).toBe(false);
    });

    it('should filter by verdict', () => {
      expect(matchesFilter(sampleRecord, { verdict: true })).toBe(true);
      expect(matchesFilter(sampleRecord, { verdict: false })).toBe(false);
    });

    it('should filter by tag', () => {
      expect(matchesFilter(sampleRecord, { tag: 'finance' })).toBe(true);
      expect(matchesFilter(sampleRecord, { tag: 'unknown' })).toBe(false);
    });

    it('should filter by chain_id', () => {
      expect(matchesFilter(sampleRecord, { chain_id: 421614 })).toBe(true);
      expect(matchesFilter(sampleRecord, { chain_id: 1 })).toBe(false);
    });

    it('should filter by time range', () => {
      expect(matchesFilter(sampleRecord, { finalized_after: 1705310000 })).toBe(true);
      expect(matchesFilter(sampleRecord, { finalized_after: 1705330000 })).toBe(false);
      expect(matchesFilter(sampleRecord, { finalized_before: 1705330000 })).toBe(true);
      expect(matchesFilter(sampleRecord, { finalized_before: 1705310000 })).toBe(false);
    });

    it('should combine multiple filters', () => {
      const filter: VerifiedOutputQueryFilter = {
        program_id: 'mmv-factual-qa',
        min_score_bps: 8000,
        verdict: true,
        tag: 'finance',
      };

      expect(matchesFilter(sampleRecord, filter)).toBe(true);

      // Change one filter to not match
      filter.min_score_bps = 9000;
      expect(matchesFilter(sampleRecord, filter)).toBe(false);
    });
  });

  describe('bundle hash consistency', () => {
    it('should produce consistent bundle_hash across builds', () => {
      const bundle = createSampleBundleV02();

      const record1 = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://test',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const record2 = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://test',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      expect(record1.bundle_hash).toBe(record2.bundle_hash);
    });

    it('should match canonical hash of bundle without signatures', () => {
      const bundle = createSampleBundleV02();
      const { signatures, ...bundleWithoutSig } = bundle;

      const record = buildVerifiedOutputRecord({
        bundle,
        program_id: 'test',
        program_version: '1.0.0',
        bundle_uri: 'ipfs://test',
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      });

      const expectedHash = hashCanonical(bundleWithoutSig);
      expect(record.bundle_hash).toBe(expectedHash);
    });
  });
});
