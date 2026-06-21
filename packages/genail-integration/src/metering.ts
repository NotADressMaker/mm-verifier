/**
 * Metering module for GenAIL runtime
 *
 * This module provides resource tracking and limit enforcement
 * for GenAIL script executions within MAMV.
 */

import { createHash } from 'crypto';
import {
  MeteringState,
  MeteringLimits,
  MeteringCheckResult,
  MeteringCallLog,
  MMVExecutionContext,
  ModelCallRecord,
} from './types';

// ============================================================================
// Metering State Management
// ============================================================================

/**
 * Creates a new metering state for an execution
 */
export function createMeteringState(): MeteringState {
  return {
    llm_calls: 0,
    total_tokens: 0,
    execution_ms: 0,
    retrieval_calls: 0,
    started_at: Date.now(),
    ended_at: undefined,
    call_log: [],
  };
}

/**
 * Finalizes metering state when execution completes
 */
export function finalizeMeteringState(state: MeteringState): MeteringState {
  return {
    ...state,
    ended_at: Date.now(),
    execution_ms: Date.now() - state.started_at,
  };
}

/**
 * Records an LLM generate call in metering state
 */
export function recordLLMCall(
  state: MeteringState,
  params: {
    model: string;
    tokens_in: number;
    tokens_out: number;
    duration_ms: number;
    success: boolean;
    error?: string;
  }
): MeteringState {
  const callLog: MeteringCallLog = {
    call_type: 'generate',
    timestamp: Date.now(),
    duration_ms: params.duration_ms,
    tokens_in: params.tokens_in,
    tokens_out: params.tokens_out,
    model: params.model,
    success: params.success,
    error: params.error,
  };

  return {
    ...state,
    llm_calls: state.llm_calls + 1,
    total_tokens: state.total_tokens + params.tokens_in + params.tokens_out,
    call_log: [...state.call_log, callLog],
  };
}

/**
 * Records a tool/retrieval call in metering state
 */
export function recordToolCall(
  state: MeteringState,
  params: {
    tool_name: string;
    duration_ms: number;
    success: boolean;
    error?: string;
  }
): MeteringState {
  const callLog: MeteringCallLog = {
    call_type: 'tool',
    timestamp: Date.now(),
    duration_ms: params.duration_ms,
    tool_name: params.tool_name,
    success: params.success,
    error: params.error,
  };

  return {
    ...state,
    retrieval_calls: state.retrieval_calls + 1,
    call_log: [...state.call_log, callLog],
  };
}

// ============================================================================
// Limit Checking
// ============================================================================

/**
 * Default metering limits
 */
export const DEFAULT_METERING_LIMITS: MeteringLimits = {
  max_llm_calls: 50,
  max_total_tokens: 100000,
  max_execution_ms: 300000, // 5 minutes
  max_retrieval_calls: 100,
  on_exceed: 'warn',
};

/**
 * Checks metering state against limits
 */
export function checkMeteringLimits(
  state: MeteringState,
  limits: MeteringLimits
): MeteringCheckResult {
  const exceeded: string[] = [];
  const warnings: string[] = [];

  const currentExecutionMs = state.ended_at
    ? state.execution_ms
    : Date.now() - state.started_at;

  // Calculate utilization percentages
  const llmCallsPct = (state.llm_calls / limits.max_llm_calls) * 100;
  const tokensPct = (state.total_tokens / limits.max_total_tokens) * 100;
  const executionPct = (currentExecutionMs / limits.max_execution_ms) * 100;
  const retrievalPct = limits.max_retrieval_calls
    ? (state.retrieval_calls / limits.max_retrieval_calls) * 100
    : 0;

  // Check for exceeded limits
  if (state.llm_calls > limits.max_llm_calls) {
    exceeded.push(`LLM calls: ${state.llm_calls}/${limits.max_llm_calls}`);
  } else if (llmCallsPct >= 80) {
    warnings.push(`LLM calls at ${llmCallsPct.toFixed(1)}% of limit`);
  }

  if (state.total_tokens > limits.max_total_tokens) {
    exceeded.push(`Total tokens: ${state.total_tokens}/${limits.max_total_tokens}`);
  } else if (tokensPct >= 80) {
    warnings.push(`Tokens at ${tokensPct.toFixed(1)}% of limit`);
  }

  if (currentExecutionMs > limits.max_execution_ms) {
    exceeded.push(`Execution time: ${currentExecutionMs}ms/${limits.max_execution_ms}ms`);
  } else if (executionPct >= 80) {
    warnings.push(`Execution time at ${executionPct.toFixed(1)}% of limit`);
  }

  if (limits.max_retrieval_calls && state.retrieval_calls > limits.max_retrieval_calls) {
    exceeded.push(`Retrieval calls: ${state.retrieval_calls}/${limits.max_retrieval_calls}`);
  } else if (retrievalPct >= 80) {
    warnings.push(`Retrieval calls at ${retrievalPct.toFixed(1)}% of limit`);
  }

  return {
    within_limits: exceeded.length === 0,
    exceeded,
    warnings,
    utilization: {
      llm_calls_pct: llmCallsPct,
      tokens_pct: tokensPct,
      execution_pct: executionPct,
      retrieval_pct: retrievalPct,
    },
  };
}

/**
 * Enforces metering limits based on configuration
 * Throws if limits exceeded and on_exceed is 'error'
 */
export function enforceMeteringLimits(
  state: MeteringState,
  limits: MeteringLimits
): MeteringCheckResult {
  const result = checkMeteringLimits(state, limits);

  if (!result.within_limits && limits.on_exceed === 'error') {
    throw new MeteringLimitExceededError(
      `Metering limits exceeded: ${result.exceeded.join(', ')}`,
      result
    );
  }

  return result;
}

/**
 * Error thrown when metering limits are exceeded
 */
export class MeteringLimitExceededError extends Error {
  public readonly check: MeteringCheckResult;

  constructor(message: string, check: MeteringCheckResult) {
    super(message);
    this.name = 'MeteringLimitExceededError';
    this.check = check;
  }
}

// ============================================================================
// Model Call Recording
// ============================================================================

/**
 * Generates a unique call ID
 */
export function generateCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Computes hash of content for provenance
 */
export function computeContentHash(content: string): string {
  return '0x' + createHash('sha256').update(content).digest('hex');
}

/**
 * Computes model commitment hash
 */
export function computeModelCommitmentHash(
  provider: string,
  model: string,
  config?: Record<string, unknown>
): string {
  const data = JSON.stringify({
    provider,
    model,
    config: config ?? {},
  });
  return '0x' + createHash('sha256').update(data).digest('hex');
}

/**
 * Creates a model call record for provenance tracking
 */
export function createModelCallRecord(params: {
  provider: string;
  model: string;
  prompt: string;
  response: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  temperature?: number;
  config?: Record<string, unknown>;
}): ModelCallRecord {
  return {
    call_id: generateCallId(),
    timestamp: Date.now(),
    provider: params.provider,
    model: params.model,
    prompt_hash: computeContentHash(params.prompt),
    response_hash: computeContentHash(params.response),
    tokens_in: params.tokens_in,
    tokens_out: params.tokens_out,
    duration_ms: params.duration_ms,
    temperature: params.temperature,
    model_commitment_hash: computeModelCommitmentHash(
      params.provider,
      params.model,
      params.config
    ),
  };
}

// ============================================================================
// Metering Hooks Factory
// ============================================================================

/**
 * Creates metering hooks for GenAIL runtime integration
 */
export function createMeteringHooks(
  ctx: MMVExecutionContext,
  limits?: MeteringLimits
) {
  const effectiveLimits = limits ?? DEFAULT_METERING_LIMITS;

  return {
    /**
     * Hook called before LLM generation
     */
    beforeGenerate: async (prompt: string, model: string): Promise<void> => {
      // Check limits before making call
      const check = checkMeteringLimits(ctx.metering, effectiveLimits);

      if (check.warnings.length > 0 && ctx.limits) {
        // Approaching limits
        console.warn(`[MAMV Metering] Warning: ${check.warnings.join(', ')}`);
      }

      if (!check.within_limits && effectiveLimits.on_exceed === 'error') {
        throw new MeteringLimitExceededError(
          `Cannot proceed: ${check.exceeded.join(', ')}`,
          check
        );
      }
    },

    /**
     * Hook called after LLM generation
     */
    afterGenerate: async (
      prompt: string,
      response: string,
      model: string,
      provider: string,
      tokens: { in: number; out: number },
      duration_ms: number,
      config?: Record<string, unknown>
    ): Promise<void> => {
      // Record the call in metering state
      ctx.metering = recordLLMCall(ctx.metering, {
        model,
        tokens_in: tokens.in,
        tokens_out: tokens.out,
        duration_ms,
        success: true,
      });

      // Record for provenance
      const callRecord = createModelCallRecord({
        provider,
        model,
        prompt,
        response,
        tokens_in: tokens.in,
        tokens_out: tokens.out,
        duration_ms,
        config,
      });
      ctx.model_calls.push(callRecord);

      // Enforce limits
      enforceMeteringLimits(ctx.metering, effectiveLimits);
    },

    /**
     * Hook called before tool execution
     */
    beforeToolCall: async (toolName: string, _args: unknown): Promise<void> => {
      // Check retrieval limits
      if (effectiveLimits.max_retrieval_calls) {
        const check = checkMeteringLimits(ctx.metering, effectiveLimits);
        if (!check.within_limits && effectiveLimits.on_exceed === 'error') {
          throw new MeteringLimitExceededError(
            `Cannot call tool ${toolName}: ${check.exceeded.join(', ')}`,
            check
          );
        }
      }
    },

    /**
     * Hook called after tool execution
     */
    afterToolCall: async (
      toolName: string,
      _result: unknown,
      duration_ms: number,
      success: boolean,
      error?: string
    ): Promise<void> => {
      ctx.metering = recordToolCall(ctx.metering, {
        tool_name: toolName,
        duration_ms,
        success,
        error,
      });

      // Enforce limits
      enforceMeteringLimits(ctx.metering, effectiveLimits);
    },

    /**
     * Hook called on execution error
     */
    onError: async (error: Error): Promise<void> => {
      // Record error in last call log entry if applicable
      const lastCall = ctx.metering.call_log[ctx.metering.call_log.length - 1];
      if (lastCall && lastCall.success) {
        lastCall.success = false;
        lastCall.error = error.message;
      }
    },
  };
}

// ============================================================================
// Metering Summary
// ============================================================================

/**
 * Generates a human-readable metering summary
 */
export function generateMeteringSummary(state: MeteringState): string {
  const lines = [
    '=== Metering Summary ===',
    `LLM Calls: ${state.llm_calls}`,
    `Total Tokens: ${state.total_tokens}`,
    `Execution Time: ${state.execution_ms}ms`,
    `Retrieval Calls: ${state.retrieval_calls}`,
    `Call Log Entries: ${state.call_log.length}`,
  ];

  if (state.call_log.length > 0) {
    lines.push('', '--- Call Breakdown ---');

    const generateCalls = state.call_log.filter((c) => c.call_type === 'generate');
    const toolCalls = state.call_log.filter((c) => c.call_type === 'tool');

    if (generateCalls.length > 0) {
      const totalGenTokens = generateCalls.reduce(
        (sum, c) => sum + (c.tokens_in ?? 0) + (c.tokens_out ?? 0),
        0
      );
      const avgGenTime =
        generateCalls.reduce((sum, c) => sum + c.duration_ms, 0) / generateCalls.length;
      lines.push(`Generate: ${generateCalls.length} calls, ${totalGenTokens} tokens, avg ${avgGenTime.toFixed(0)}ms`);
    }

    if (toolCalls.length > 0) {
      const avgToolTime =
        toolCalls.reduce((sum, c) => sum + c.duration_ms, 0) / toolCalls.length;
      lines.push(`Tools: ${toolCalls.length} calls, avg ${avgToolTime.toFixed(0)}ms`);
    }
  }

  return lines.join('\n');
}
