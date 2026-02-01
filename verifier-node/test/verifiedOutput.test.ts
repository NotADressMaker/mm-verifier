import {
  VerifiedOutputRecord,
  RevealedEventData,
  FinalizedEventData,
  OnChainTaskData,
  RecordQueryFilter,
  buildRecordFromChainData,
  buildRecordFromReceipt,
  matchesFilter,
  paginateRecords,
  hashRecord,
  normalizeTaskIdBytes32,
  validateRecord,
  isVerifiedOutputRecord,
  WORTHY_MIN_BPS,
  SCORE_THRESHOLDS,
} from '../../shared/verifiedOutput';
import { MMVReceipt } from '../../shared/types';

// Sample on-chain task data
const createSampleTaskData = (): OnChainTaskData => ({
  taskId: '12345',
  finalScoreBps: 8500,
  bundleHash: '0x' + '11'.repeat(32),
  bundleUri: 'ipfs://QmTestBundle123',
  evaluator: '0x1234567890abcdef1234567890abcdef12345678',
  finalizedAt: 1705320000,
  blockNumber: 12345678,
  txHash: '0x' + '22'.repeat(32),
});

// Sample MMVReceipt
const createSampleReceipt = (): MMVReceipt => ({
  receipt_version: '0.1',
  generated_at: '2024-01-15T12:00:00Z',
  task_id: '12345',
  input_hash: '0x' + '33'.repeat(32),
  selected_output_hash: '0x' + '44'.repeat(32),
  decision: {
    pass: true,
    overall_score: 85, // 0-100 scale
    selected_index: 0,
    candidate_scores: [
      {
        index: 0,
        score: 85,
        confidence: 0.9,
        riskFlags: [],
        rationale: 'Good answer',
      },
    ],
  },
  verifier: {
    provider: 'openai',
    model: 'gpt-4',
    version: '1.0.0',
    config_hash: '0x' + '55'.repeat(32),
  },
  provenance: {
    request_timestamp: 1705319000,
    response_timestamp: 1705320000,
    model_latency_ms: 1500,
    prompt_tokens: 100,
    completion_tokens: 200,
    raw_response_hash: '0x' + '66'.repeat(32),
  },
});

describe('VerifiedOutputRecord', () => {
  describe('Constants', () => {
    it('should have correct default WORTHY_MIN_BPS', () => {
      expect(WORTHY_MIN_BPS).toBe(8000);
    });

    it('should have correct SCORE_THRESHOLDS', () => {
      expect(SCORE_THRESHOLDS.WORTHY).toBe(WORTHY_MIN_BPS);
      expect(SCORE_THRESHOLDS.PASS).toBe(5000);
      expect(SCORE_THRESHOLDS.RELIABLE).toBe(8000);
    });
  });

  describe('buildRecordFromChainData', () => {
    it('should build valid record from on-chain data', () => {
      const taskData = createSampleTaskData();

      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      });

      expect(record.record_version).toBe('1');
      expect(record.task_id).toBe('12345');
      expect(record.score_bps).toBe(8500);
      expect(record.verdict).toBe(true); // 8500 >= 5000
      expect(record.worthy).toBe(true); // 8500 >= 8000
      expect(record.bundle_hash).toBe(taskData.bundleHash);
      expect(record.bundle_uri).toBe(taskData.bundleUri);
      expect(record.finalized_at).toBe(1705320000);
      expect(record.chain_id).toBe(421614);
      expect(record.evaluator).toBe(taskData.evaluator);
      expect(record.block_number).toBe(12345678);
    });

    it('should include input/output hashes from receipt', () => {
      const taskData = createSampleTaskData();
      const receipt = createSampleReceipt();

      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        receipt,
      });

      expect(record.input_hash).toBe(receipt.input_hash);
      expect(record.output_hash).toBe(receipt.selected_output_hash);
    });

    it('should set verdict=false for low scores', () => {
      const taskData = createSampleTaskData();
      taskData.finalScoreBps = 4000; // Below PASS threshold

      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      expect(record.verdict).toBe(false);
      expect(record.worthy).toBe(false);
    });

    it('should set worthy=false for medium scores', () => {
      const taskData = createSampleTaskData();
      taskData.finalScoreBps = 6000; // Above PASS but below WORTHY

      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      expect(record.verdict).toBe(true); // 6000 >= 5000
      expect(record.worthy).toBe(false); // 6000 < 8000
    });
  });

  describe('buildRecordFromReceipt', () => {
    it('should build record from MMVReceipt', () => {
      const receipt = createSampleReceipt();

      const record = buildRecordFromReceipt(receipt, {
        chainId: 421614,
        contractAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        bundleHash: '0x' + '77'.repeat(32),
        bundleUri: 'ipfs://QmReceiptBundle',
        finalizedAt: 1705320000,
      });

      expect(record.record_version).toBe('1');
      expect(record.task_id).toBe('12345');
      expect(record.score_bps).toBe(8500); // 85 * 100
      expect(record.verdict).toBe(true);
      expect(record.worthy).toBe(true);
      expect(record.input_hash).toBe(receipt.input_hash);
      expect(record.output_hash).toBe(receipt.selected_output_hash);
    });
  });

  describe('matchesFilter', () => {
    let sampleRecord: VerifiedOutputRecord;

    beforeEach(() => {
      const taskData = createSampleTaskData();
      sampleRecord = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });
    });

    it('should match empty filter', () => {
      expect(matchesFilter(sampleRecord, {})).toBe(true);
    });

    it('should filter by min_score_bps', () => {
      expect(matchesFilter(sampleRecord, { min_score_bps: 8000 })).toBe(true);
      expect(matchesFilter(sampleRecord, { min_score_bps: 9000 })).toBe(false);
    });

    it('should filter by worthy_only', () => {
      expect(matchesFilter(sampleRecord, { worthy_only: true })).toBe(true);

      // Create non-worthy record
      const lowScoreData = createSampleTaskData();
      lowScoreData.finalScoreBps = 6000;
      const lowRecord = buildRecordFromChainData({
        taskData: lowScoreData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      expect(matchesFilter(lowRecord, { worthy_only: true })).toBe(false);
      expect(matchesFilter(lowRecord, { worthy_only: false })).toBe(true);
    });

    it('should filter by verdict', () => {
      expect(matchesFilter(sampleRecord, { verdict: true })).toBe(true);
      expect(matchesFilter(sampleRecord, { verdict: false })).toBe(false);
    });

    it('should filter by time range', () => {
      expect(matchesFilter(sampleRecord, { finalized_after: 1705310000 })).toBe(true);
      expect(matchesFilter(sampleRecord, { finalized_after: 1705330000 })).toBe(false);
      expect(matchesFilter(sampleRecord, { finalized_before: 1705330000 })).toBe(true);
      expect(matchesFilter(sampleRecord, { finalized_before: 1705310000 })).toBe(false);
    });

    it('should combine multiple filters', () => {
      const filter: RecordQueryFilter = {
        min_score_bps: 8000,
        worthy_only: true,
        verdict: true,
      };

      expect(matchesFilter(sampleRecord, filter)).toBe(true);

      filter.min_score_bps = 9000;
      expect(matchesFilter(sampleRecord, filter)).toBe(false);
    });
  });

  describe('paginateRecords', () => {
    it('should paginate correctly', () => {
      const records: VerifiedOutputRecord[] = [];
      for (let i = 0; i < 10; i++) {
        const taskData = createSampleTaskData();
        taskData.taskId = `task-${i}`;
        records.push(
          buildRecordFromChainData({
            taskData,
            chainId: 421614,
            contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
          })
        );
      }

      const result1 = paginateRecords(records, 3, 0);
      expect(result1.records.length).toBe(3);
      expect(result1.total).toBe(10);
      expect(result1.has_more).toBe(true);

      const result2 = paginateRecords(records, 3, 9);
      expect(result2.records.length).toBe(1);
      expect(result2.total).toBe(10);
      expect(result2.has_more).toBe(false);
    });

    it('should handle empty list', () => {
      const result = paginateRecords([], 10, 0);
      expect(result.records.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });
  });

  describe('hashRecord', () => {
    it('should produce deterministic hash', () => {
      const taskData = createSampleTaskData();
      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      const hash1 = hashRecord(record);
      const hash2 = hashRecord(record);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should differ for different records', () => {
      const taskData1 = createSampleTaskData();
      const taskData2 = createSampleTaskData();
      taskData2.taskId = '54321';

      const record1 = buildRecordFromChainData({
        taskData: taskData1,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      const record2 = buildRecordFromChainData({
        taskData: taskData2,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      expect(hashRecord(record1)).not.toBe(hashRecord(record2));
    });
  });

  describe('normalizeTaskIdBytes32', () => {
    it('should normalize numeric string', () => {
      const result = normalizeTaskIdBytes32('999');
      expect(result).toBe('0x' + '0'.repeat(61) + '3e7');
    });

    it('should normalize hex string', () => {
      const result = normalizeTaskIdBytes32('0x123');
      expect(result).toBe('0x' + '0'.repeat(61) + '123');
    });

    it('should handle already-padded hex', () => {
      const padded = '0x' + '11'.repeat(32);
      const result = normalizeTaskIdBytes32(padded);
      expect(result).toBe(padded);
    });
  });

  describe('validateRecord', () => {
    it('should validate correct record', () => {
      const taskData = createSampleTaskData();
      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      const result = validateRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid record_version', () => {
      const record: any = {
        record_version: '2',
        task_id: '123',
        score_bps: 8000,
        verdict: true,
        worthy: true,
        bundle_hash: '0x11',
        bundle_uri: 'ipfs://test',
        finalized_at: 1705320000,
        chain_id: 1,
        contract_address: '0x1234567890abcdef1234567890abcdef12345678',
      };

      const result = validateRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('record_version'))).toBe(true);
    });

    it('should reject invalid score_bps', () => {
      const taskData = createSampleTaskData();
      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      (record as any).score_bps = 15000;

      const result = validateRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('score_bps'))).toBe(true);
    });

    it('should reject non-object', () => {
      const result = validateRecord('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Record must be an object');
    });
  });

  describe('isVerifiedOutputRecord', () => {
    it('should return true for valid record', () => {
      const taskData = createSampleTaskData();
      const record = buildRecordFromChainData({
        taskData,
        chainId: 421614,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      expect(isVerifiedOutputRecord(record)).toBe(true);
    });

    it('should return false for invalid record', () => {
      expect(isVerifiedOutputRecord({ foo: 'bar' })).toBe(false);
      expect(isVerifiedOutputRecord(null)).toBe(false);
      expect(isVerifiedOutputRecord(undefined)).toBe(false);
    });
  });
});
