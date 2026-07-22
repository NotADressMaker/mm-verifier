import Queue from 'bull';
import { logger } from '../utils/logger';
import { queryMultipleModels } from '../llm-providers/modelRouter';
import { scoreVerification } from '../scoring/scorer';
import { createEvidenceBundle } from '../evidence/evidenceBundler';
import {
  hashEvidenceBundle,
  calculateMetering,
  checkMeteringLimits,
  ExecutionMetering,
} from '../evidence/evidenceBundlerV2';
import { storeEncryptedEvidenceBundle } from '../evidence/evidenceStorage';
import {
  commitEvaluation,
  revealEvaluation,
  generateCommitHash,
  generateSalt,
  wallet,
} from './blockchain';
import { toScoreBps } from '../utils/score';
import {
  MeteringLimits,
  DEFAULT_METERING_LIMITS,
} from '../../../shared/programs';
import { programRegistry } from './programRegistry';
import { validateEvidenceBundleV1 } from '../../../shared/schemaValidation';
import { ProgramContext } from '../../../programs/interface';
import { getChainIdFromEnv } from '../../../shared/env';
import { runWithLogContext } from '../../../shared/observability/logger';
import {
  createDebugTrace,
  endStage,
  startStage,
} from '../../../shared/observability/debugTrace';
import { storeDebugTrace, getDebugTrace } from './debugTraceStore';
import { verifierMetrics } from '../observability/metrics';
import { TraceContext } from '../../../shared/observability/tracing';
import { assessGenericity } from '../verifiers/genericity';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Job queue
const jobQueue = new Queue('verification-jobs', REDIS_URL);

// Store commit data for reveal phase
const commitStore = new Map<
  string,
  {
    salt: string;
    scoreBps: number;
    bundleHash: string;
    bundleURI: string;
  }
>();

/**
 * Start job processor
 */
export async function startJobProcessor() {
  logger.info('Starting job processor');

  // Process verification jobs
  jobQueue.process('verify', async (job) => {
    const {
      jobId,
      prompt,
      promptHash,
      models,
      taskType,
      programId,
      programVersion,
      traceContext,
      requestId,
      enqueuedAt,
      storeEvidence,
    } = job.data as {
      jobId: string;
      prompt: string;
      promptHash: string;
      models: string[];
      taskType: string;
      programId?: string;
      programVersion?: string;
      traceContext?: TraceContext;
      requestId?: string;
      enqueuedAt?: number;
      storeEvidence?: boolean;
    };
    return runWithLogContext(
      {
        request_id: requestId,
        task_id: jobId,
        job_id: job.id,
        program_id: programId,
        program_version: programVersion,
        trace_id: traceContext?.trace_id,
        span_id: traceContext?.span_id,
      },
      async () => {
        const jobStart = Date.now();
        let queryDurationMs = 0;
        let bundleDurationMs = 0;

        // Determine metering limits from program or use defaults
        const meteringLimits: MeteringLimits = DEFAULT_METERING_LIMITS;
        let llmCallCount = 0;
        let totalTokens = 0;
        let retrievalCallCount = 0;

        verifierMetrics.metrics.activeJobs.inc();

        const enqueueLatency = enqueuedAt ? jobStart - enqueuedAt : undefined;
        if (enqueueLatency !== undefined) {
          verifierMetrics.metrics.jobLatencyMs.labels('enqueue_to_start').observe(enqueueLatency);
        }

        const hashedOnlyDefault = process.env.HASHED_ONLY_DEFAULT !== 'false';
        const shouldStoreEvidence = typeof storeEvidence === 'boolean' ? storeEvidence : !hashedOnlyDefault;
        const storageMode = shouldStoreEvidence ? 'encrypted' : 'hashed-only';

        logger.info('Processing verification job', {
          jobId,
          models,
          taskType,
          programId,
          programVersion,
          meteringLimits,
          storageMode,
        });

        const trace =
          (await getDebugTrace(jobId)) ?? createDebugTrace(jobId, traceContext?.trace_id);

        try {
          // Step 1: Query all models
          startStage(trace, 'provider calls', { models });
          logger.info('Querying models', { jobId, models });
          const queryStart = Date.now();
          const responses = await queryMultipleModels(prompt, models);
          llmCallCount = responses.length;
          totalTokens = responses.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);
          queryDurationMs = Date.now() - queryStart;
          verifierMetrics.metrics.jobLatencyMs.labels('provider_calls').observe(queryDurationMs);
          logger.info('Timing: model queries', {
            jobId,
            durationMs: queryDurationMs,
          });

          logger.info('Model queries completed', {
            jobId,
            responseCount: responses.length,
            llmCallCount,
            totalTokens,
          });
          endStage(trace, 'provider calls', 'ok', {
            response_count: responses.length,
            duration_ms: queryDurationMs,
            providers: responses.map((response) => ({
              provider: response.provider,
              model: response.model,
              latency_ms: response.provider_call?.latency_ms,
              retries: response.provider_call?.retries,
              tokens_in: response.provider_call?.tokens_in,
              tokens_out: response.provider_call?.tokens_out,
              status: response.provider_call?.status,
            })),
          });

          startStage(trace, 'normalization', {
            response_count: responses.length,
          });
          endStage(trace, 'normalization', 'ok');

          // Step 2: Score the verification
          startStage(trace, 'checkers');
          logger.info('Scoring verification', { jobId });
          const scoringStart = Date.now();
          const scoringResult = await scoreVerification(prompt, responses, taskType);
          const scoringDuration = Date.now() - scoringStart;
          logger.info('Timing: scoring', {
            jobId,
            durationMs: scoringDuration,
          });
          endStage(trace, 'checkers', 'ok', {
            duration_ms: scoringDuration,
            score: scoringResult.score,
            verdict: scoringResult.verdict,
          });

          logger.info('Scoring completed', {
            jobId,
            score: scoringResult.score,
            verdict: scoringResult.verdict,
          });

          // Step 3: Create evidence bundle
          startStage(trace, 'receipt');
          logger.info('Creating evidence bundle', { jobId });
          const bundleStart = Date.now();
          const nodeId = process.env.VERIFIER_NODE_ID || 'default';
          const marketplaceAddress = process.env.MARKETPLACE_ADDRESS || '';
          const evidenceBundle = await createEvidenceBundle({
            taskId: jobId,
            nodeId,
            ethAddress: wallet.address,
            promptHash,
            responses,
            scoringResult,
            wallet,
            marketplaceAddress,
          });
          bundleDurationMs = Date.now() - bundleStart;
          logger.info('Timing: evidence bundle', {
            jobId,
            durationMs: bundleDurationMs,
          });

          const bundleValidation = validateEvidenceBundleV1(evidenceBundle);
          if (!bundleValidation.valid) {
            logger.error('Evidence bundle failed schema validation', {
              jobId,
              errors: bundleValidation.errors,
            });
            endStage(trace, 'receipt', 'error', { errors: bundleValidation.errors });
            await storeDebugTrace(jobId, trace);
            return;
          }

          // Step 4: Upload evidence to IPFS
          logger.info('Uploading evidence to IPFS', { jobId });
          const uploadStart = Date.now();
          const { signatures, ...bundleWithoutSig } = evidenceBundle;
          const bundleHash = hashEvidenceBundle(bundleWithoutSig);
          let evidenceCid = `hash-only://${bundleHash}`;

          if (shouldStoreEvidence) {
            const stored = await storeEncryptedEvidenceBundle({
              bundle: evidenceBundle,
              bundle_hash: bundleHash,
            });
            evidenceCid = stored.uri;
          }
          logger.info('Timing: ipfs upload', {
            jobId,
            durationMs: Date.now() - uploadStart,
          });

          logger.info('Evidence uploaded', {
            jobId,
            cid: evidenceCid,
            hash: bundleHash,
          });

          // Step 4.5: Calculate and check metering
          const bundleJson = JSON.stringify(evidenceBundle);
          const metering: ExecutionMetering = {
            llm_calls: llmCallCount,
            total_tokens: totalTokens,
            execution_ms: Date.now() - jobStart,
            retrieval_calls: retrievalCallCount,
            bundle_size_bytes: bundleJson.length,
          };

          const meteringCheck = checkMeteringLimits(metering, meteringLimits);
          if (meteringCheck.exceeded) {
            logger.warn('Metering limits exceeded', {
              jobId,
              violations: meteringCheck.violations,
              metering,
            });
          }

          logger.info('Metering recorded', { jobId, metering });

          const outputHash = evidenceBundle.model_runs[0]?.output_hash;
          if (!outputHash) {
            logger.error('Evidence bundle missing output hash', { jobId });
            endStage(trace, 'receipt', 'error', {
              error: 'missing_output_hash',
            });
            await storeDebugTrace(jobId, trace);
            return;
          }

          const envChainId = getChainIdFromEnv();
          const network = wallet.provider ? await wallet.provider.getNetwork() : undefined;
          const chainId = envChainId ?? (network ? Number(network.chainId) : undefined);

          if (!chainId) {
            logger.error('Chain ID not available for program context', { jobId });
            endStage(trace, 'receipt', 'error', {
              error: 'missing_chain_id',
            });
            await storeDebugTrace(jobId, trace);
            return;
          }

          startStage(trace, 'program scoring');
          let receipt;
          const programRunStart = Date.now();
          try {
            const record = programRegistry.resolveProgram(programId, programVersion);
            const context: ProgramContext = {
              task_id: jobId,
              input_hash: promptHash as `0x${string}`,
              output_hash: outputHash as `0x${string}`,
              bundle_hash: bundleHash as `0x${string}`,
              bundle_uri: evidenceCid,
              bundle_version: evidenceBundle.bundle_version,
              chain_id: chainId,
              contract_address: marketplaceAddress as `0x${string}`,
              llm_provider: responses[0]?.provider ?? 'unknown',
              llm_model: responses[0]?.model ?? 'unknown',
              verifier_node: nodeId,
              software_version: evidenceBundle.evaluator.software.ver,
              program_hash: record.hash,
              metering,
              timings_ms: {
                fetch: queryDurationMs,
                total: Date.now() - jobStart,
              },
            };

            receipt = await programRegistry.runProgram(
            evidenceBundle,
            context,
            programId,
            programVersion
          );
          } catch (error: any) {
            logger.error('Program execution failed', { jobId, error: error.message });
            endStage(trace, 'program scoring', 'error', {
              error: error.message,
            });
            await storeDebugTrace(jobId, trace);
            return;
          }

          const programRunMs = Date.now() - programRunStart;
          endStage(trace, 'program scoring', 'ok', { duration_ms: programRunMs });
          const assessedClaim = scoringResult.claim_graph.claim_summary[0]?.canonical_text;
          const genericity = assessedClaim ? await assessGenericity({ claim: assessedClaim, evidenceRelations: receipt.evidence_relations }) : null;
          if (genericity && (genericity.isGeneric || /^(all|most|some)\b/i.test(assessedClaim) || genericity.warnings.length)) {
            receipt.genericity_assessment = genericity;
            for (const message of genericity.warnings) receipt.warnings = [...(receipt.warnings ?? []), { code: 'genericity', severity: genericity.overgeneralization.severity === 'high' ? 'high' : 'medium', message }];
          }

          if (receipt.explain) {
            receipt.explain.timings_ms = {
              ...receipt.explain.timings_ms,
              program_run: programRunMs,
              total: receipt.explain.timings_ms?.total ?? Date.now() - jobStart,
            };
            receipt.explain.debug_trace_uri = `/api/jobs/${jobId}/trace`;
            receipt.explain.checks = {
              ...receipt.explain.checks,
              claim_graph: {
                agreement_ratio: scoringResult.claim_graph.agreement_ratio,
                contradiction_count: scoringResult.claim_graph.contradiction_count,
                citation_coverage: scoringResult.claim_graph.citation_coverage,
                total_claims: scoringResult.claim_graph.total_claims,
              },
              evidence_storage: {
                mode: storageMode,
                bundle_uri: evidenceCid,
              },
            };
            receipt.explain.score_components = [
              ...receipt.explain.score_components,
              {
                name: 'claim_coverage',
                score_bps: scoringResult.claim_graph.score_components.coverage_bps,
                notes: 'Coverage of core claims supported by a majority.',
              },
              {
                name: 'claim_contradictions',
                score_bps: Math.max(
                  0,
                  10000 - scoringResult.claim_graph.score_components.contradiction_penalty_bps
                ),
                notes: 'Penalty based on contradiction severity.',
              },
              {
                name: 'claim_citation_quality',
                score_bps: scoringResult.claim_graph.score_components.citation_quality_bps,
                notes: 'Citation density, overlap, and domain quality signals.',
              },
            ];
            receipt.explain.claim_summary = scoringResult.claim_graph.claim_summary;
            receipt.explain.score_components_detail = scoringResult.claim_graph.score_components;
            receipt.explain.highlights = scoringResult.claim_graph.highlights;
            receipt.explain.bft_quorum = scoringResult.bft_quorum;
            receipt.explain.outliers = scoringResult.outliers;
            receipt.explain.vote_merkle_root = scoringResult.vote_merkle_root;
          }

          logger.info('Program receipt generated', {
            jobId,
            programId: receipt.program?.id,
            programVersion: receipt.program?.version,
            programHash: receipt.program?.hash,
          });

          endStage(trace, 'receipt', 'ok', {
            bundle_hash: bundleHash,
            bundle_uri: evidenceCid,
          });

          // Step 5: Generate commitment
          const commitPrepStart = Date.now();
          const salt = generateSalt();
          const scoreBps = toScoreBps(scoringResult.score);
          const commitHash = generateCommitHash(
            jobId,
            wallet.address,
            scoreBps,
            bundleHash,
            salt
          );
          logger.info('Timing: commitment prep', {
            jobId,
            durationMs: Date.now() - commitPrepStart,
          });

          // Store commit data for reveal
          commitStore.set(jobId, {
            salt,
            scoreBps,
            bundleHash,
            bundleURI: evidenceCid,
          });

          logger.info('Generated commitment', { jobId, commitHash });

          // Step 6: Submit commitment to blockchain
          startStage(trace, 'chain submit', {
            chain_id: chainId,
          });
          logger.info('Submitting commitment', { jobId });
          const commitTxStart = Date.now();
          await commitEvaluation(jobId, commitHash);
          const commitTxDuration = Date.now() - commitTxStart;
          verifierMetrics.metrics.chainFinalityMs
            .labels('commit', String(chainId))
            .observe(commitTxDuration);
          logger.info('Timing: commit tx', {
            jobId,
            durationMs: commitTxDuration,
          });

          logger.info('Commitment submitted successfully', { jobId });
          endStage(trace, 'chain submit', 'ok', {
            duration_ms: commitTxDuration,
          });

          // Schedule reveal (after commit phase ends)
          const revealDelay = parseInt(process.env.REVEAL_DELAY_MS || '3700000'); // ~1 hour

          logger.info('Scheduling reveal', { jobId, delayMs: revealDelay });

          setTimeout(async () => {
            await revealEvaluationForJob(jobId);
          }, revealDelay);

          const totalDuration = Date.now() - jobStart;
          verifierMetrics.metrics.jobLatencyMs.labels('start_to_complete').observe(totalDuration);

          logger.info('Timing: job total', {
            jobId,
            durationMs: totalDuration,
          });

          await storeDebugTrace(jobId, trace);

          return {
            success: true,
            jobId,
            scoreBps,
            bundleHash,
            bundleURI: evidenceCid,
            commitHash,
          };
        } catch (error: any) {
          verifierMetrics.metrics.jobsFailedTotal.labels('job_processing_failed').inc();
          logger.error('Job processing failed', { jobId, error: error.message });
          throw error;
        } finally {
          verifierMetrics.metrics.activeJobs.dec();
        }
      }
    );
  });

  // Event handlers
  jobQueue.on('completed', (job, result) => {
    logger.info('Job completed', { jobId: job.id, result });
  });

  jobQueue.on('failed', (job, error) => {
    logger.error('Job failed', { jobId: job?.id, error: error.message });
  });

  logger.info('Job processor started and listening for jobs');
}

/**
 * Reveal evaluation for a job
 */
async function revealEvaluationForJob(jobId: string) {
  try {
    const revealStart = Date.now();
    const commitData = commitStore.get(jobId);

    if (!commitData) {
      logger.error('No commit data found for reveal', { jobId });
      return;
    }

    logger.info('Revealing evaluation', {
      jobId,
      scoreBps: commitData.scoreBps,
    });

    await revealEvaluation(
      jobId,
      commitData.scoreBps,
      commitData.bundleHash,
      commitData.bundleURI,
      commitData.salt
    );

    const revealDuration = Date.now() - revealStart;
    const envChainId = getChainIdFromEnv();
    const network = wallet.provider ? await wallet.provider.getNetwork() : undefined;
    const chainId = envChainId ?? (network ? Number(network.chainId) : undefined);

    if (chainId) {
      verifierMetrics.metrics.chainFinalityMs
        .labels('reveal', String(chainId))
        .observe(revealDuration);
    }

    logger.info('Timing: reveal tx', {
      jobId,
      durationMs: revealDuration,
    });

    logger.info('Evaluation revealed successfully', { jobId });

    // Clean up commit store
    commitStore.delete(jobId);
  } catch (error: any) {
    logger.error('Failed to reveal evaluation', { jobId, error: error.message });
  }
}

export { jobQueue };
