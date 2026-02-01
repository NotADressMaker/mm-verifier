/**
 * MMV-wrapped GenAIL runtime
 *
 * This module provides the main runtime wrapper that integrates
 * GenAIL execution with MMV metering, receipts, and evidence.
 */

import {
  MMVGenAILConfig,
  MMVExecutionContext,
  MMVExecutionResult,
  GenAILProgram,
  GenAILRuntimeHooks,
  MeteringLimits,
  MeteringCheckResult,
} from './types';
import {
  createMeteringState,
  finalizeMeteringState,
  createMeteringHooks,
  checkMeteringLimits,
  DEFAULT_METERING_LIMITS,
  MeteringLimitExceededError,
} from './metering';
import {
  buildReceipt,
  generateExecutionId,
  submitForVerification,
  computeProgramFingerprint,
} from './receipt';
import {
  parseGenAILProgram,
  buildEvidenceBundle,
  storeEvidence,
  DEFAULT_EVIDENCE_OPTIONS,
} from './evidence';

// ============================================================================
// Runtime Configuration
// ============================================================================

/**
 * Default MMV GenAIL configuration
 */
export const DEFAULT_CONFIG: Partial<MMVGenAILConfig> = {
  auto_verify: false,
  worthy_threshold_bps: 8000,
  metering_limits: DEFAULT_METERING_LIMITS,
  evidence: DEFAULT_EVIDENCE_OPTIONS,
};

/**
 * Merges user config with defaults
 */
function mergeConfig(userConfig: Partial<MMVGenAILConfig>): MMVGenAILConfig {
  return {
    mmv: userConfig.mmv ?? { base_url: '', auto_verify: false },
    auto_verify: userConfig.auto_verify ?? DEFAULT_CONFIG.auto_verify!,
    worthy_threshold_bps:
      userConfig.worthy_threshold_bps ?? DEFAULT_CONFIG.worthy_threshold_bps,
    metering_limits: userConfig.metering_limits ?? DEFAULT_CONFIG.metering_limits,
    hooks: userConfig.hooks,
    evidence: userConfig.evidence ?? DEFAULT_CONFIG.evidence,
  };
}

// ============================================================================
// Execution Context Factory
// ============================================================================

/**
 * Creates a new execution context for a GenAIL script
 */
export function createExecutionContext(
  program: GenAILProgram,
  inputs: Record<string, unknown>,
  config: MMVGenAILConfig
): MMVExecutionContext {
  return {
    execution_id: generateExecutionId(),
    program,
    metering: createMeteringState(),
    limits: config.metering_limits,
    inputs,
    outputs: {},
    model_calls: [],
    auto_verify: config.auto_verify,
    mmv_config: config.mmv,
  };
}

// ============================================================================
// MMV GenAIL Runtime Wrapper
// ============================================================================

/**
 * MMV-wrapped GenAIL runtime
 *
 * This class wraps GenAIL runtime execution with:
 * - Metering hooks for resource tracking
 * - Automatic verification receipt generation
 * - Auditable evidence bundle export
 */
export class MMVGenAILRuntime {
  private config: MMVGenAILConfig;

  constructor(config: Partial<MMVGenAILConfig>) {
    this.config = mergeConfig(config);
  }

  /**
   * Executes a GenAIL script with MMV integration
   *
   * @param source - GenAIL source code
   * @param inputs - Input variables for the script
   * @param options - Execution options
   */
  async execute(
    source: string,
    inputs: Record<string, unknown>,
    options: {
      /** Override auto_verify for this execution */
      verify?: boolean;
      /** Override metering limits for this execution */
      limits?: MeteringLimits;
      /** Custom hooks for this execution */
      hooks?: GenAILRuntimeHooks;
    } = {}
  ): Promise<MMVExecutionResult> {
    // Parse the program
    const program = parseGenAILProgram(source);

    // Create execution context
    const ctx = createExecutionContext(program, inputs, {
      ...this.config,
      metering_limits: options.limits ?? this.config.metering_limits,
      auto_verify: options.verify ?? this.config.auto_verify,
    });

    // Merge hooks
    const hooks = {
      ...this.config.hooks,
      ...options.hooks,
    };

    try {
      // Execute the script with metering
      const outputs = await this.executeWithMetering(ctx, source, inputs, hooks);
      ctx.outputs = outputs;

      // Finalize metering
      ctx.metering = finalizeMeteringState(ctx.metering);

      // Check final metering limits
      const meteringCheck = checkMeteringLimits(
        ctx.metering,
        ctx.limits ?? DEFAULT_METERING_LIMITS
      );

      // Build receipt
      let receipt = buildReceipt(ctx);

      // Auto-verify if enabled
      if (ctx.auto_verify && ctx.mmv_config?.base_url) {
        try {
          receipt = await submitForVerification(ctx, ctx.mmv_config);
        } catch (verifyError) {
          console.error('Auto-verification failed:', verifyError);
          // Continue without verification
        }
      }

      // Build evidence bundle
      const evidence = buildEvidenceBundle(ctx, this.config.evidence);

      // Store evidence if configured
      if (this.config.evidence?.storage && this.config.evidence.storage !== 'local') {
        const stored = await storeEvidence(evidence, this.config.evidence.storage);
        receipt.evidence.bundle_uri = stored.uri;
      }

      // Call completion hook
      if (hooks.onComplete) {
        await hooks.onComplete(ctx);
      }

      return {
        context: ctx,
        outputs,
        receipt,
        evidence,
        metering_check: meteringCheck,
        success: true,
      };
    } catch (error) {
      // Finalize metering even on error
      ctx.metering = finalizeMeteringState(ctx.metering);

      // Call error hook
      if (hooks.onError) {
        await hooks.onError(ctx, error as Error);
      }

      const meteringCheck = checkMeteringLimits(
        ctx.metering,
        ctx.limits ?? DEFAULT_METERING_LIMITS
      );

      return {
        context: ctx,
        outputs: ctx.outputs,
        receipt: buildReceipt(ctx),
        evidence: buildEvidenceBundle(ctx, this.config.evidence),
        metering_check: meteringCheck,
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Executes script with metering hooks
   *
   * This is a simulation of GenAIL execution with hooks.
   * In production, this would integrate with actual GenAIL runtime.
   */
  private async executeWithMetering(
    ctx: MMVExecutionContext,
    _source: string,
    inputs: Record<string, unknown>,
    hooks: GenAILRuntimeHooks
  ): Promise<Record<string, unknown>> {
    // Create metering hooks
    const meteringHooks = createMeteringHooks(ctx, ctx.limits);

    // This is where actual GenAIL runtime integration would happen.
    // The GenAIL runtime would need to be modified to call these hooks:
    //
    // genailRuntime.on('beforeGenerate', async (prompt, model) => {
    //   await meteringHooks.beforeGenerate(prompt, model);
    //   if (hooks.beforeGenerate) await hooks.beforeGenerate(ctx, prompt, model);
    // });
    //
    // genailRuntime.on('afterGenerate', async (prompt, response, model, tokens) => {
    //   await meteringHooks.afterGenerate(prompt, response, model, provider, tokens, duration);
    //   if (hooks.afterGenerate) await hooks.afterGenerate(ctx, prompt, response, model, tokens);
    // });
    //
    // For now, return inputs as outputs (placeholder)

    // Simulate checking metering warnings
    const check = checkMeteringLimits(ctx.metering, ctx.limits ?? DEFAULT_METERING_LIMITS);
    if (check.warnings.length > 0 && hooks.onMeteringWarning) {
      await hooks.onMeteringWarning(ctx, check);
    }

    // Return placeholder outputs
    return {
      ...inputs,
      _executed: true,
      _execution_id: ctx.execution_id,
    };
  }

  /**
   * Validates a program without executing it
   */
  validateProgram(source: string): {
    valid: boolean;
    program: GenAILProgram;
    fingerprint: string;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      const program = parseGenAILProgram(source);
      const fingerprint = computeProgramFingerprint(program);

      // Basic validation
      if (program.metadata.models.length === 0) {
        errors.push('No model declarations found');
      }

      if (program.metadata.generate_count === 0) {
        errors.push('No generate statements found');
      }

      return {
        valid: errors.length === 0,
        program,
        fingerprint,
        errors,
      };
    } catch (parseError) {
      return {
        valid: false,
        program: {
          source,
          source_hash: '',
          metadata: {
            models: [],
            tools: [],
            variables: [],
            generate_count: 0,
            message_count: 0,
            complexity_score: 0,
          },
        },
        fingerprint: '',
        errors: [`Parse error: ${(parseError as Error).message}`],
      };
    }
  }

  /**
   * Gets the current configuration
   */
  getConfig(): MMVGenAILConfig {
    return { ...this.config };
  }

  /**
   * Updates configuration
   */
  updateConfig(updates: Partial<MMVGenAILConfig>): void {
    this.config = mergeConfig({ ...this.config, ...updates });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new MMV GenAIL runtime instance
 */
export function createRuntime(config: Partial<MMVGenAILConfig>): MMVGenAILRuntime {
  return new MMVGenAILRuntime(config);
}

/**
 * Creates a runtime with MMV API configured
 */
export function createVerifiedRuntime(
  mmvBaseUrl: string,
  mmvApiKey?: string,
  options: Partial<Omit<MMVGenAILConfig, 'mmv'>> = {}
): MMVGenAILRuntime {
  return new MMVGenAILRuntime({
    ...options,
    mmv: {
      base_url: mmvBaseUrl,
      api_key: mmvApiKey,
      auto_verify: true,
    },
    auto_verify: true,
  });
}

// ============================================================================
// Convenience Execution Functions
// ============================================================================

/**
 * Executes a GenAIL script with default configuration
 */
export async function executeGenAIL(
  source: string,
  inputs: Record<string, unknown>,
  config: Partial<MMVGenAILConfig> = {}
): Promise<MMVExecutionResult> {
  const runtime = createRuntime(config);
  return runtime.execute(source, inputs);
}

/**
 * Executes a GenAIL script and returns only the receipt
 */
export async function executeAndGetReceipt(
  source: string,
  inputs: Record<string, unknown>,
  mmvConfig?: { base_url: string; api_key?: string }
): Promise<{
  receipt: MMVExecutionResult['receipt'];
  success: boolean;
  error?: Error;
}> {
  const config: Partial<MMVGenAILConfig> = mmvConfig
    ? {
        mmv: { ...mmvConfig, auto_verify: true },
        auto_verify: true,
      }
    : {};

  const result = await executeGenAIL(source, inputs, config);

  return {
    receipt: result.receipt,
    success: result.success,
    error: result.error,
  };
}

/**
 * Validates and fingerprints a GenAIL program
 */
export function validateAndFingerprint(source: string): {
  valid: boolean;
  fingerprint: string;
  metadata: GenAILProgram['metadata'];
  errors: string[];
} {
  const runtime = createRuntime({});
  const result = runtime.validateProgram(source);

  return {
    valid: result.valid,
    fingerprint: result.fingerprint,
    metadata: result.program.metadata,
    errors: result.errors,
  };
}
