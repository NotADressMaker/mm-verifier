/**
 * Unit tests for the SDK quickstart module
 *
 * Tests cover:
 * 1. Valid receipt verification
 * 2. Invalid hash detection
 * 3. Wrong chain/contract detection
 */

import { verifyReceiptOnchain, FACTUAL_CONSENSUS_PROGRAM } from '../src/quickstart';
import { Receipt } from '../src/types';

describe('verifyReceiptOnchain', () => {
  // Sample valid receipt
  const validReceipt: Receipt = {
    task_id: 'task_abc123',
    verdict: true,
    score_bps: 8500,
    bundle_hash: '0x' + '11'.repeat(32),
    bundle_uri: 'ipfs://QmTestBundle',
    program_id: 'factual-consensus-v1',
    program_version: '1.0.0',
    chain_id: 421614,
    contract_address: '0x0000000000000000000000000000000000000000',
  };

  describe('valid receipt', () => {
    it('should return valid=true for a correct receipt', () => {
      const result = verifyReceiptOnchain(validReceipt);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.checks.receipt_exists).toBe(true);
      expect(result.checks.hash_matches).toBe(true);
      expect(result.checks.chain_matches).toBe(true);
      expect(result.checks.contract_matches).toBe(true);
    });

    it('should accept receipt with custom chain/contract when matching', () => {
      const customReceipt: Receipt = {
        ...validReceipt,
        chain_id: 1,
        contract_address: '0x1234567890123456789012345678901234567890',
      };

      const result = verifyReceiptOnchain(
        customReceipt,
        1,
        '0x1234567890123456789012345678901234567890'
      );

      expect(result.valid).toBe(true);
      expect(result.checks.chain_matches).toBe(true);
      expect(result.checks.contract_matches).toBe(true);
    });
  });

  describe('invalid hash', () => {
    it('should reject receipt with invalid hash format (too short)', () => {
      const invalidReceipt: Receipt = {
        ...validReceipt,
        bundle_hash: '0x123', // Too short
      };

      const result = verifyReceiptOnchain(invalidReceipt);

      expect(result.valid).toBe(false);
      expect(result.checks.hash_matches).toBe(false);
      expect(result.errors.some((e) => e.includes('bundle_hash'))).toBe(true);
    });

    it('should reject receipt with invalid hash format (no 0x prefix)', () => {
      const invalidReceipt: Receipt = {
        ...validReceipt,
        bundle_hash: '11'.repeat(32), // No 0x prefix
      };

      const result = verifyReceiptOnchain(invalidReceipt);

      expect(result.valid).toBe(false);
      expect(result.checks.hash_matches).toBe(false);
    });

    it('should reject receipt with invalid hex characters', () => {
      const invalidReceipt: Receipt = {
        ...validReceipt,
        bundle_hash: '0x' + 'gg'.repeat(32), // Invalid hex
      };

      const result = verifyReceiptOnchain(invalidReceipt);

      expect(result.valid).toBe(false);
      expect(result.checks.hash_matches).toBe(false);
    });
  });

  describe('wrong chain/contract', () => {
    it('should reject receipt with wrong chain ID', () => {
      const result = verifyReceiptOnchain(
        validReceipt,
        1, // Expected chain 1, but receipt has 421614
        '0x0000000000000000000000000000000000000000'
      );

      expect(result.valid).toBe(false);
      expect(result.checks.chain_matches).toBe(false);
      expect(result.errors.some((e) => e.includes('Chain ID mismatch'))).toBe(true);
    });

    it('should reject receipt with wrong contract address', () => {
      const result = verifyReceiptOnchain(
        validReceipt,
        421614,
        '0x1111111111111111111111111111111111111111' // Different contract
      );

      expect(result.valid).toBe(false);
      expect(result.checks.contract_matches).toBe(false);
      expect(result.errors.some((e) => e.includes('Contract address mismatch'))).toBe(true);
    });

    it('should reject receipt with both wrong chain and contract', () => {
      const result = verifyReceiptOnchain(
        validReceipt,
        1,
        '0x1111111111111111111111111111111111111111'
      );

      expect(result.valid).toBe(false);
      expect(result.checks.chain_matches).toBe(false);
      expect(result.checks.contract_matches).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('missing required fields', () => {
    it('should reject receipt with missing task_id', () => {
      const invalidReceipt = {
        ...validReceipt,
        task_id: '',
      };

      const result = verifyReceiptOnchain(invalidReceipt);

      expect(result.valid).toBe(false);
      expect(result.checks.receipt_exists).toBe(false);
    });

    it('should handle receipt with undefined fields gracefully', () => {
      const partialReceipt = {
        task_id: 'test',
        verdict: true,
        score_bps: 8000,
      } as Receipt;

      const result = verifyReceiptOnchain(partialReceipt);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('FACTUAL_CONSENSUS_PROGRAM', () => {
  it('should have required fields', () => {
    expect(FACTUAL_CONSENSUS_PROGRAM.program_id).toBe('factual-consensus-v1');
    expect(FACTUAL_CONSENSUS_PROGRAM.name).toBe('factual-consensus');
    expect(FACTUAL_CONSENSUS_PROGRAM.version).toBe('1.0.0');
    expect(FACTUAL_CONSENSUS_PROGRAM.fingerprint).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('should have valid steps', () => {
    expect(FACTUAL_CONSENSUS_PROGRAM.steps.length).toBeGreaterThan(0);

    const stepTypes = FACTUAL_CONSENSUS_PROGRAM.steps.map((s) => s.type);
    expect(stepTypes).toContain('prompt');
    expect(stepTypes).toContain('cross-check');
    expect(stepTypes).toContain('score');
    expect(stepTypes).toContain('evidence');
  });

  it('should have defined inputs and outputs', () => {
    expect(FACTUAL_CONSENSUS_PROGRAM.inputs).toBeDefined();
    expect(FACTUAL_CONSENSUS_PROGRAM.inputs!.length).toBeGreaterThan(0);
    expect(FACTUAL_CONSENSUS_PROGRAM.outputs).toBeDefined();
    expect(FACTUAL_CONSENSUS_PROGRAM.outputs!.length).toBeGreaterThan(0);
  });
});
