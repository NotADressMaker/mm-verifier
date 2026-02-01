/**
 * Evidence export module for GenAIL executions
 *
 * This module provides auditable evidence bundle generation
 * for GenAIL script executions within MMV.
 */

import { createHash } from 'crypto';
import {
  GenAILEvidenceBundle,
  EvidenceExportOptions,
  MMVExecutionContext,
  GenAILProgram,
  MeteringState,
  ModelCallRecord,
} from './types';
import { computeProgramFingerprint, computeInputHash, computeOutputHash } from './receipt';

// ============================================================================
// Source Normalization
// ============================================================================

/**
 * Normalizes GenAIL source code for consistent fingerprinting
 * - Removes comments
 * - Normalizes whitespace
 * - Sorts certain declarations
 */
export function normalizeSource(source: string): string {
  const lines = source.split('\n');
  const normalized: string[] = [];

  for (const line of lines) {
    // Remove single-line comments
    const withoutComment = line.replace(/#.*$/, '');

    // Trim whitespace
    const trimmed = withoutComment.trim();

    // Skip empty lines
    if (trimmed.length === 0) {
      continue;
    }

    // Normalize multiple spaces to single space
    const singleSpaced = trimmed.replace(/\s+/g, ' ');

    normalized.push(singleSpaced);
  }

  return normalized.join('\n');
}

/**
 * Computes hash of normalized source
 */
export function computeSourceHash(source: string): string {
  const normalized = normalizeSource(source);
  return '0x' + createHash('sha256').update(normalized).digest('hex');
}

// ============================================================================
// Program Parsing
// ============================================================================

/**
 * Extracts metadata from GenAIL source code
 */
export function extractProgramMetadata(source: string): {
  models: string[];
  tools: string[];
  variables: string[];
  generate_count: number;
  message_count: number;
  complexity_score: number;
} {
  const models: Set<string> = new Set();
  const tools: Set<string> = new Set();
  const variables: Set<string> = new Set();
  let generateCount = 0;
  let messageCount = 0;

  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Extract model declarations: model "gpt-4"
    const modelMatch = trimmed.match(/^model\s+["']([^"']+)["']/);
    if (modelMatch) {
      models.add(modelMatch[1]);
    }

    // Extract variable assignments: set foo = ...
    const setMatch = trimmed.match(/^set\s+(\w+)\s*=/);
    if (setMatch) {
      variables.add(setMatch[1]);
    }

    // Extract tool calls: call tool_name(...)
    const callMatch = trimmed.match(/^call\s+(\w+)/);
    if (callMatch) {
      tools.add(callMatch[1]);
    }

    // Count generate statements
    if (trimmed.startsWith('generate')) {
      generateCount++;
    }

    // Count message statements
    if (trimmed.startsWith('message')) {
      messageCount++;
    }
  }

  // Complexity score based on various factors
  const complexityScore =
    models.size * 10 +
    tools.size * 5 +
    variables.size * 2 +
    generateCount * 15 +
    messageCount * 3;

  return {
    models: Array.from(models).sort(),
    tools: Array.from(tools).sort(),
    variables: Array.from(variables).sort(),
    generate_count: generateCount,
    message_count: messageCount,
    complexity_score: complexityScore,
  };
}

/**
 * Parses GenAIL source into a program structure
 */
export function parseGenAILProgram(source: string): GenAILProgram {
  const normalized = normalizeSource(source);
  const sourceHash = computeSourceHash(source);
  const metadata = extractProgramMetadata(source);

  return {
    source,
    source_hash: sourceHash,
    metadata,
    ast: undefined, // Full AST parsing would be done by actual GenAIL parser
  };
}

// ============================================================================
// Evidence Bundle Generation
// ============================================================================

/**
 * Default evidence export options
 */
export const DEFAULT_EVIDENCE_OPTIONS: EvidenceExportOptions = {
  include_source: true,
  include_summaries: true,
  include_call_log: true,
  include_reasoning_trace: false,
  storage: 'local',
};

/**
 * Redacts sensitive values from an object for summary
 */
function redactSensitiveValues(
  obj: Record<string, unknown>,
  sensitiveKeys: string[] = ['password', 'secret', 'key', 'token', 'credential', 'auth']
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sk) => lowerKey.includes(sk));

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      // Truncate long strings
      result[key] = value.length > 100 ? value.substring(0, 100) + '...' : value;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = `[Object: ${Object.keys(value).length} keys]`;
    } else {
      result[key] = String(value);
    }
  }

  return result;
}

/**
 * Computes reasoning trace hash from model calls
 */
function computeReasoningTraceHash(modelCalls: ModelCallRecord[]): string {
  const traceData = modelCalls.map((call) => ({
    call_id: call.call_id,
    prompt_hash: call.prompt_hash,
    response_hash: call.response_hash,
    model: call.model,
  }));
  return '0x' + createHash('sha256').update(JSON.stringify(traceData)).digest('hex');
}

/**
 * Generates step summaries from model calls (without raw content)
 */
function generateStepSummaries(modelCalls: ModelCallRecord[]): string[] {
  return modelCalls.map((call, index) => {
    return `Step ${index + 1}: ${call.model} call (${call.tokens_in}→${call.tokens_out} tokens, ${call.duration_ms}ms)`;
  });
}

/**
 * Builds an auditable evidence bundle from execution context
 */
export function buildEvidenceBundle(
  ctx: MMVExecutionContext,
  options: EvidenceExportOptions = DEFAULT_EVIDENCE_OPTIONS
): GenAILEvidenceBundle {
  const inputHash = computeInputHash(ctx.inputs);
  const outputHash = computeOutputHash(ctx.outputs);
  const fingerprint = computeProgramFingerprint(ctx.program);

  // Build the bundle
  const bundle: GenAILEvidenceBundle = {
    bundle_version: '0.3',
    bundle_type: 'genail_execution',

    execution_id: ctx.execution_id,
    generated_at: Date.now(),

    program: {
      source_hash: ctx.program.source_hash,
      fingerprint,
      normalized_source: options.include_source ? normalizeSource(ctx.program.source) : '',
      metadata: ctx.program.metadata,
    },

    io: {
      input_hash: inputHash,
      output_hash: outputHash,
      input_summary: options.include_summaries
        ? redactSensitiveValues(ctx.inputs as Record<string, unknown>)
        : undefined,
      output_summary: options.include_summaries
        ? redactSensitiveValues(ctx.outputs as Record<string, unknown>)
        : undefined,
    },

    metering: options.include_call_log
      ? ctx.metering
      : {
          ...ctx.metering,
          call_log: [], // Exclude detailed call log
        },

    model_provenance: ctx.model_calls,

    reasoning_trace: options.include_reasoning_trace
      ? {
          trace_hash: computeReasoningTraceHash(ctx.model_calls),
          step_count: ctx.model_calls.length,
          step_summaries: generateStepSummaries(ctx.model_calls),
        }
      : undefined,

    integrity: {
      bundle_hash: '', // Computed below
      content_hash: '', // Computed below
      signature: undefined,
    },
  };

  // Compute content hash (everything except integrity block)
  const contentForHash = {
    ...bundle,
    integrity: undefined,
  };
  const contentHash =
    '0x' + createHash('sha256').update(JSON.stringify(contentForHash)).digest('hex');

  // Compute bundle hash
  bundle.integrity.content_hash = contentHash;
  bundle.integrity.bundle_hash =
    '0x' +
    createHash('sha256')
      .update(contentHash + bundle.execution_id + bundle.generated_at)
      .digest('hex');

  return bundle;
}

/**
 * Signs an evidence bundle
 */
export async function signEvidenceBundle(
  bundle: GenAILEvidenceBundle,
  signFn: (hash: string) => Promise<string>
): Promise<GenAILEvidenceBundle> {
  const signature = await signFn(bundle.integrity.bundle_hash);

  return {
    ...bundle,
    integrity: {
      ...bundle.integrity,
      signature,
    },
  };
}

// ============================================================================
// Evidence Validation
// ============================================================================

/**
 * Validates evidence bundle integrity
 */
export function validateEvidenceIntegrity(
  bundle: GenAILEvidenceBundle
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check version
  if (bundle.bundle_version !== '0.3') {
    errors.push(`Unsupported bundle version: ${bundle.bundle_version}`);
  }

  // Check bundle type
  if (bundle.bundle_type !== 'genail_execution') {
    errors.push(`Unexpected bundle type: ${bundle.bundle_type}`);
  }

  // Re-compute content hash
  const contentForHash = {
    ...bundle,
    integrity: undefined,
  };
  const expectedContentHash =
    '0x' + createHash('sha256').update(JSON.stringify(contentForHash)).digest('hex');

  if (bundle.integrity.content_hash !== expectedContentHash) {
    errors.push(
      `Content hash mismatch: expected ${expectedContentHash}, got ${bundle.integrity.content_hash}`
    );
  }

  // Re-compute bundle hash
  const expectedBundleHash =
    '0x' +
    createHash('sha256')
      .update(bundle.integrity.content_hash + bundle.execution_id + bundle.generated_at)
      .digest('hex');

  if (bundle.integrity.bundle_hash !== expectedBundleHash) {
    errors.push(
      `Bundle hash mismatch: expected ${expectedBundleHash}, got ${bundle.integrity.bundle_hash}`
    );
  }

  // Check required fields
  if (!bundle.execution_id) {
    errors.push('Missing execution_id');
  }

  if (!bundle.program?.fingerprint) {
    errors.push('Missing program fingerprint');
  }

  if (!bundle.io?.input_hash || !bundle.io?.output_hash) {
    errors.push('Missing input/output hashes');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates evidence bundle against execution context
 */
export function validateEvidenceAgainstContext(
  bundle: GenAILEvidenceBundle,
  ctx: MMVExecutionContext
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  // Check execution ID
  if (bundle.execution_id !== ctx.execution_id) {
    mismatches.push(
      `execution_id mismatch: bundle=${bundle.execution_id}, context=${ctx.execution_id}`
    );
  }

  // Check program fingerprint
  const expectedFingerprint = computeProgramFingerprint(ctx.program);
  if (bundle.program.fingerprint !== expectedFingerprint) {
    mismatches.push(
      `fingerprint mismatch: bundle=${bundle.program.fingerprint}, computed=${expectedFingerprint}`
    );
  }

  // Check input/output hashes
  const expectedInputHash = computeInputHash(ctx.inputs);
  const expectedOutputHash = computeOutputHash(ctx.outputs);

  if (bundle.io.input_hash !== expectedInputHash) {
    mismatches.push(
      `input_hash mismatch: bundle=${bundle.io.input_hash}, computed=${expectedInputHash}`
    );
  }

  if (bundle.io.output_hash !== expectedOutputHash) {
    mismatches.push(
      `output_hash mismatch: bundle=${bundle.io.output_hash}, computed=${expectedOutputHash}`
    );
  }

  // Check model call count
  if (bundle.model_provenance.length !== ctx.model_calls.length) {
    mismatches.push(
      `model_calls count mismatch: bundle=${bundle.model_provenance.length}, context=${ctx.model_calls.length}`
    );
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

// ============================================================================
// Evidence Storage
// ============================================================================

/**
 * Serializes evidence bundle to JSON
 */
export function serializeEvidence(bundle: GenAILEvidenceBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Deserializes evidence bundle from JSON
 */
export function deserializeEvidence(json: string): GenAILEvidenceBundle {
  const bundle = JSON.parse(json) as GenAILEvidenceBundle;
  const validation = validateEvidenceIntegrity(bundle);

  if (!validation.valid) {
    throw new Error(`Invalid evidence bundle: ${validation.errors.join(', ')}`);
  }

  return bundle;
}

/**
 * Stores evidence bundle to specified storage
 */
export async function storeEvidence(
  bundle: GenAILEvidenceBundle,
  storage: 'local' | 'ipfs' | 'arweave' = 'local'
): Promise<{ uri: string; hash: string }> {
  const serialized = serializeEvidence(bundle);

  switch (storage) {
    case 'local':
      // For local storage, return a data URI
      const base64 = Buffer.from(serialized).toString('base64');
      return {
        uri: `data:application/json;base64,${base64}`,
        hash: bundle.integrity.bundle_hash,
      };

    case 'ipfs':
      // Placeholder for IPFS integration
      // In production, use ipfs-http-client or similar
      throw new Error('IPFS storage not yet implemented');

    case 'arweave':
      // Placeholder for Arweave integration
      // In production, use arweave-js or similar
      throw new Error('Arweave storage not yet implemented');

    default:
      throw new Error(`Unsupported storage type: ${storage}`);
  }
}

/**
 * Formats evidence bundle for display
 */
export function formatEvidenceSummary(bundle: GenAILEvidenceBundle): string {
  const lines = [
    '=== GenAIL Evidence Bundle ===',
    `Version: ${bundle.bundle_version}`,
    `Execution ID: ${bundle.execution_id}`,
    `Generated: ${new Date(bundle.generated_at).toISOString()}`,
    '',
    '--- Program ---',
    `Source Hash: ${bundle.program.source_hash.substring(0, 18)}...`,
    `Fingerprint: ${bundle.program.fingerprint.substring(0, 18)}...`,
    `Models: ${bundle.program.metadata.models.join(', ')}`,
    `Tools: ${bundle.program.metadata.tools.join(', ') || 'none'}`,
    `Complexity: ${bundle.program.metadata.complexity_score}`,
    '',
    '--- I/O ---',
    `Input Hash: ${bundle.io.input_hash.substring(0, 18)}...`,
    `Output Hash: ${bundle.io.output_hash.substring(0, 18)}...`,
    '',
    '--- Metering ---',
    `LLM Calls: ${bundle.metering.llm_calls}`,
    `Tokens: ${bundle.metering.total_tokens}`,
    `Execution: ${bundle.metering.execution_ms}ms`,
    `Retrieval: ${bundle.metering.retrieval_calls}`,
    '',
    '--- Model Provenance ---',
    ...bundle.model_provenance.map(
      (m, i) =>
        `  ${i + 1}. ${m.model} (${m.provider}) - commitment: ${m.model_commitment_hash?.substring(0, 12)}...`
    ),
    '',
    '--- Integrity ---',
    `Bundle Hash: ${bundle.integrity.bundle_hash.substring(0, 18)}...`,
    `Content Hash: ${bundle.integrity.content_hash.substring(0, 18)}...`,
    `Signed: ${bundle.integrity.signature ? 'Yes' : 'No'}`,
  ];

  if (bundle.reasoning_trace) {
    lines.push(
      '',
      '--- Reasoning Trace ---',
      `Trace Hash: ${bundle.reasoning_trace.trace_hash.substring(0, 18)}...`,
      `Steps: ${bundle.reasoning_trace.step_count}`
    );
  }

  return lines.join('\n');
}
