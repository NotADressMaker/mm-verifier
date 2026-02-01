/**
 * Receipt generation module for GenAIL executions
 *
 * This module provides auto-generation of verification receipts
 * for GenAIL script executions within MMV.
 */

import { createHash } from 'crypto';
import {
  GenAILVerificationReceipt,
  MMVExecutionContext,
  GenAILProgram,
  MeteringState,
  ModelCallRecord,
  MMVConfig,
} from './types';

// ============================================================================
// Hash Computation
// ============================================================================

/**
 * Computes SHA-256 hash of content
 */
function sha256(content: string): string {
  return '0x' + createHash('sha256').update(content).digest('hex');
}

/**
 * Computes keccak256-style hash (simplified, uses SHA-256 for compatibility)
 * In production, use actual keccak256 from ethers.js or similar
 */
function keccak256(content: string): string {
  return sha256(content);
}

/**
 * Computes canonical hash of an object (sorted keys, no whitespace)
 */
function computeCanonicalHash(obj: unknown): string {
  const canonical = JSON.stringify(obj, Object.keys(obj as object).sort());
  return keccak256(canonical);
}

/**
 * Computes input hash from execution context
 */
export function computeInputHash(inputs: Record<string, unknown>): string {
  return computeCanonicalHash(inputs);
}

/**
 * Computes output hash from execution context
 */
export function computeOutputHash(outputs: Record<string, unknown>): string {
  return computeCanonicalHash(outputs);
}

/**
 * Computes program fingerprint from GenAIL program
 */
export function computeProgramFingerprint(program: GenAILProgram): string {
  const fingerprintData = {
    source_hash: program.source_hash,
    models: program.metadata.models.sort(),
    tools: program.metadata.tools.sort(),
    generate_count: program.metadata.generate_count,
    message_count: program.metadata.message_count,
  };
  return computeCanonicalHash(fingerprintData);
}

// ============================================================================
// Receipt Generation
// ============================================================================

/**
 * Generates a unique execution ID
 */
export function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Builds a verification receipt from execution context
 */
export function buildReceipt(
  ctx: MMVExecutionContext,
  verification?: {
    task_id: string;
    score_bps: number;
    verdict: boolean;
    worthy: boolean;
    verified_at: number;
    chain_context?: {
      chain_id: number;
      tx_hash: string;
      block_number: number;
    };
  }
): GenAILVerificationReceipt {
  const inputHash = computeInputHash(ctx.inputs);
  const outputHash = computeOutputHash(ctx.outputs);
  const fingerprint = computeProgramFingerprint(ctx.program);

  // Build evidence bundle hash from all components
  const evidenceData = {
    execution_id: ctx.execution_id,
    input_hash: inputHash,
    output_hash: outputHash,
    program_fingerprint: fingerprint,
    metering: {
      llm_calls: ctx.metering.llm_calls,
      total_tokens: ctx.metering.total_tokens,
      execution_ms: ctx.metering.execution_ms,
      retrieval_calls: ctx.metering.retrieval_calls,
    },
    model_calls: ctx.model_calls.map((c) => ({
      provider: c.provider,
      model: c.model,
      model_commitment_hash: c.model_commitment_hash,
    })),
  };
  const bundleHash = computeCanonicalHash(evidenceData);

  return {
    receipt_version: '1.0',
    execution_id: ctx.execution_id,
    task_id: verification?.task_id,

    program: {
      source_hash: ctx.program.source_hash,
      fingerprint,
      metadata: ctx.program.metadata,
    },

    input_hash: inputHash,
    output_hash: outputHash,

    score_bps: verification?.score_bps ?? 0,
    verdict: verification?.verdict ?? false,
    worthy: verification?.worthy ?? false,

    metering: {
      llm_calls: ctx.metering.llm_calls,
      total_tokens: ctx.metering.total_tokens,
      execution_ms: ctx.metering.execution_ms,
      retrieval_calls: ctx.metering.retrieval_calls,
    },

    model_calls: ctx.model_calls.map((c) => ({
      provider: c.provider,
      model: c.model,
      model_commitment_hash: c.model_commitment_hash ?? '',
    })),

    evidence: {
      bundle_hash: bundleHash,
      bundle_uri: undefined, // Set by evidence export
    },

    executed_at: ctx.metering.started_at,
    verified_at: verification?.verified_at,

    chain_context: verification?.chain_context,
  };
}

/**
 * Computes the hash of a receipt for signing/verification
 */
export function computeReceiptHash(receipt: GenAILVerificationReceipt): string {
  const hashData = {
    receipt_version: receipt.receipt_version,
    execution_id: receipt.execution_id,
    task_id: receipt.task_id,
    input_hash: receipt.input_hash,
    output_hash: receipt.output_hash,
    score_bps: receipt.score_bps,
    verdict: receipt.verdict,
    worthy: receipt.worthy,
    program_fingerprint: receipt.program.fingerprint,
    evidence_bundle_hash: receipt.evidence.bundle_hash,
    executed_at: receipt.executed_at,
    verified_at: receipt.verified_at,
  };
  return computeCanonicalHash(hashData);
}

// ============================================================================
// Receipt Validation
// ============================================================================

/**
 * Validates receipt integrity
 */
export function validateReceiptIntegrity(
  receipt: GenAILVerificationReceipt
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (receipt.receipt_version !== '1.0') {
    errors.push(`Unsupported receipt version: ${receipt.receipt_version}`);
  }

  if (!receipt.execution_id) {
    errors.push('Missing execution_id');
  }

  if (!receipt.input_hash || !receipt.input_hash.startsWith('0x')) {
    errors.push('Invalid input_hash format');
  }

  if (!receipt.output_hash || !receipt.output_hash.startsWith('0x')) {
    errors.push('Invalid output_hash format');
  }

  if (!receipt.program?.fingerprint) {
    errors.push('Missing program fingerprint');
  }

  if (!receipt.evidence?.bundle_hash) {
    errors.push('Missing evidence bundle_hash');
  }

  // Validate score range
  if (receipt.score_bps < 0 || receipt.score_bps > 10000) {
    errors.push(`Invalid score_bps: ${receipt.score_bps} (must be 0-10000)`);
  }

  // Validate metering
  if (receipt.metering) {
    if (receipt.metering.llm_calls < 0) {
      errors.push('Invalid metering: negative llm_calls');
    }
    if (receipt.metering.total_tokens < 0) {
      errors.push('Invalid metering: negative total_tokens');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates receipt against execution context (re-computation check)
 */
export function validateReceiptAgainstContext(
  receipt: GenAILVerificationReceipt,
  ctx: MMVExecutionContext
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  // Re-compute hashes
  const expectedInputHash = computeInputHash(ctx.inputs);
  const expectedOutputHash = computeOutputHash(ctx.outputs);
  const expectedFingerprint = computeProgramFingerprint(ctx.program);

  if (receipt.input_hash !== expectedInputHash) {
    mismatches.push(
      `input_hash mismatch: receipt=${receipt.input_hash}, computed=${expectedInputHash}`
    );
  }

  if (receipt.output_hash !== expectedOutputHash) {
    mismatches.push(
      `output_hash mismatch: receipt=${receipt.output_hash}, computed=${expectedOutputHash}`
    );
  }

  if (receipt.program.fingerprint !== expectedFingerprint) {
    mismatches.push(
      `program fingerprint mismatch: receipt=${receipt.program.fingerprint}, computed=${expectedFingerprint}`
    );
  }

  // Check metering
  if (receipt.metering.llm_calls !== ctx.metering.llm_calls) {
    mismatches.push(
      `llm_calls mismatch: receipt=${receipt.metering.llm_calls}, context=${ctx.metering.llm_calls}`
    );
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

// ============================================================================
// MMV API Integration
// ============================================================================

/**
 * Submits execution to MMV for verification and returns updated receipt
 */
export async function submitForVerification(
  ctx: MMVExecutionContext,
  mmvConfig: MMVConfig
): Promise<GenAILVerificationReceipt> {
  // Build initial receipt
  const receipt = buildReceipt(ctx);

  // Prepare verification request
  const verifyRequest = {
    prompt: JSON.stringify(ctx.inputs),
    response: JSON.stringify(ctx.outputs),
    task_type: 'genail_execution',
    metadata: {
      execution_id: ctx.execution_id,
      program_fingerprint: receipt.program.fingerprint,
      metering: receipt.metering,
    },
  };

  // Submit to MMV API
  const response = await fetch(`${mmvConfig.base_url}/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mmvConfig.api_key ? { Authorization: `Bearer ${mmvConfig.api_key}` } : {}),
    },
    body: JSON.stringify(verifyRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MMV verification failed: ${error}`);
  }

  const result = await response.json();

  // Update receipt with verification result
  return {
    ...receipt,
    task_id: result.task_id,
    score_bps: result.score_bps ?? 0,
    verdict: result.verdict ?? false,
    worthy: result.worthy ?? (result.score_bps >= (mmvConfig.min_score_threshold ?? 8000)),
    verified_at: Date.now(),
  };
}

/**
 * Polls MMV API for verification completion
 */
export async function waitForVerification(
  taskId: string,
  mmvConfig: MMVConfig,
  options: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<{
  score_bps: number;
  verdict: boolean;
  worthy: boolean;
  chain_context?: {
    chain_id: number;
    tx_hash: string;
    block_number: number;
  };
}> {
  const pollInterval = options.pollIntervalMs ?? 5000;
  const timeout = options.timeoutMs ?? 300000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${mmvConfig.base_url}/v1/tasks/${taskId}`, {
      headers: {
        ...(mmvConfig.api_key ? { Authorization: `Bearer ${mmvConfig.api_key}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to check task status: ${await response.text()}`);
    }

    const task = await response.json();

    if (task.status === 'finalized') {
      return {
        score_bps: task.score_bps,
        verdict: task.verdict,
        worthy: task.score_bps >= (mmvConfig.min_score_threshold ?? 8000),
        chain_context: task.chain_context,
      };
    }

    if (task.status === 'failed') {
      throw new Error(`Verification failed: ${JSON.stringify(task.errors)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Verification timeout after ${timeout}ms`);
}

// ============================================================================
// Receipt Serialization
// ============================================================================

/**
 * Serializes receipt to JSON string
 */
export function serializeReceipt(receipt: GenAILVerificationReceipt): string {
  return JSON.stringify(receipt, null, 2);
}

/**
 * Deserializes receipt from JSON string
 */
export function deserializeReceipt(json: string): GenAILVerificationReceipt {
  const receipt = JSON.parse(json) as GenAILVerificationReceipt;
  const validation = validateReceiptIntegrity(receipt);

  if (!validation.valid) {
    throw new Error(`Invalid receipt: ${validation.errors.join(', ')}`);
  }

  return receipt;
}

/**
 * Formats receipt for display
 */
export function formatReceiptSummary(receipt: GenAILVerificationReceipt): string {
  const lines = [
    '=== GenAIL Verification Receipt ===',
    `Execution ID: ${receipt.execution_id}`,
    `Task ID: ${receipt.task_id ?? 'N/A'}`,
    '',
    '--- Verification Result ---',
    `Score: ${receipt.score_bps / 100}%`,
    `Verdict: ${receipt.verdict ? 'PASS' : 'FAIL'}`,
    `Worthy: ${receipt.worthy ? 'YES' : 'NO'}`,
    '',
    '--- Program ---',
    `Fingerprint: ${receipt.program.fingerprint.substring(0, 18)}...`,
    `Models: ${receipt.program.metadata.models.join(', ')}`,
    `Tools: ${receipt.program.metadata.tools.join(', ') || 'none'}`,
    '',
    '--- Metering ---',
    `LLM Calls: ${receipt.metering.llm_calls}`,
    `Tokens: ${receipt.metering.total_tokens}`,
    `Execution: ${receipt.metering.execution_ms}ms`,
    '',
    '--- Hashes ---',
    `Input: ${receipt.input_hash.substring(0, 18)}...`,
    `Output: ${receipt.output_hash.substring(0, 18)}...`,
    `Evidence: ${receipt.evidence.bundle_hash.substring(0, 18)}...`,
  ];

  if (receipt.chain_context) {
    lines.push(
      '',
      '--- Chain Context ---',
      `Chain ID: ${receipt.chain_context.chain_id}`,
      `Block: ${receipt.chain_context.block_number}`,
      `Tx: ${receipt.chain_context.tx_hash.substring(0, 18)}...`
    );
  }

  return lines.join('\n');
}
