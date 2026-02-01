import {
  ProgramDefinition,
  ProgramRecord,
  VerifyRequest,
  VerifyResponse,
  VerifiedOutputRecord,
  RecordQueryFilter,
  RecordListResponse,
  RecordResponse,
  OnChainVerifyResult,
  VerificationReceipt,
  ReceiptResponse,
  Receipt,
  VerifyOptions,
  OnchainVerifyResult,
} from './types';

// Default configuration
const DEFAULT_CHAIN_ID = 421614; // Arbitrum Sepolia
const DEFAULT_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_PROGRAM_ID = 'factual-consensus-v1';
const DEFAULT_PROGRAM_VERSION = '1.0.0';

export interface MMVClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetcher?: typeof fetch;
  /** Chain ID for receipts (default: 421614 for Arbitrum Sepolia) */
  chainId?: number;
  /** Contract address for receipts */
  contractAddress?: string;
}

export interface VerifyTextParams {
  prompt: string;
  models: string[];
  taskType: string;
  idempotencyKey?: string;
}

export interface VerifyWithProgramParams {
  prompt: string;
  models: string[];
  taskType: string;
  program?: ProgramDefinition;
  programId?: string;
  idempotencyKey?: string;
}

export class MMVClient {
  private baseUrl: string;
  private apiKey?: string;
  private fetcher: typeof fetch;
  private chainId: number;
  private contractAddress: string;

  constructor(options: MMVClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    this.chainId = options.chainId ?? DEFAULT_CHAIN_ID;
    this.contractAddress = options.contractAddress ?? DEFAULT_CONTRACT_ADDRESS;
  }

  // ============================================================================
  // Quickstart API - Simple verify() entrypoint
  // ============================================================================

  /**
   * Verify LLM output and return a compact receipt.
   * This is the recommended entrypoint for new integrations.
   *
   * @param text - The LLM output text to verify
   * @param options - Optional configuration
   * @returns A compact Receipt object
   *
   * @example
   * ```ts
   * const client = new MMVClient({ baseUrl: 'http://localhost:3000' });
   * const receipt = await client.verifyOutput('Paris is the capital of France');
   * console.log(receipt.verdict ? 'Verified' : 'Unverified');
   * ```
   */
  async verifyOutput(text: string, options: VerifyOptions = {}): Promise<Receipt> {
    const models = options.models ?? ['gpt-4', 'claude-3'];
    const taskType = options.taskType ?? 'factual-qa';
    const programId = options.programId ?? DEFAULT_PROGRAM_ID;
    const timeoutMs = options.timeoutMs ?? 120000;
    const pollIntervalMs = options.pollIntervalMs ?? 3000;

    // Submit the verification task
    const task = await this.verifyWithProgram({
      prompt: text,
      models,
      taskType,
      programId,
    });

    // Wait for finalization
    const fullReceipt = await this.waitForFinal(task.task_id, {
      timeoutMs,
      pollIntervalMs,
    });

    // Convert to compact receipt
    return this.toCompactReceipt(fullReceipt);
  }

  /**
   * Convert a full VerificationReceipt to a compact Receipt
   */
  private toCompactReceipt(receipt: VerificationReceipt): Receipt {
    return {
      task_id: receipt.task_id,
      verdict: receipt.verdict,
      score_bps: receipt.score_bps,
      bundle_hash: receipt.evidence.bundle_hash,
      bundle_uri: receipt.evidence.bundle_uri,
      program_id: receipt.program?.program_id ?? DEFAULT_PROGRAM_ID,
      program_version: receipt.program?.version ?? DEFAULT_PROGRAM_VERSION,
      chain_id: receipt.chain_context?.chain_id ?? this.chainId,
      contract_address: receipt.chain_context?.contract_address ?? this.contractAddress,
    };
  }

  async verifyText(params: VerifyTextParams): Promise<VerifyResponse> {
    return this.verify({
      prompt: params.prompt,
      models: params.models,
      task_type: params.taskType,
      idempotency_key: params.idempotencyKey,
    });
  }

  async verifyWithProgram(params: VerifyWithProgramParams): Promise<VerifyResponse> {
    return this.verify({
      prompt: params.prompt,
      models: params.models,
      task_type: params.taskType,
      program: params.program,
      program_id: params.programId,
      idempotency_key: params.idempotencyKey,
    });
  }

  async registerProgram(program: ProgramDefinition): Promise<ProgramRecord> {
    return this.request<ProgramRecord>('/v1/programs', {
      method: 'POST',
      body: JSON.stringify(program),
    });
  }

  async listPrograms(): Promise<{ total: number; programs: ProgramRecord[] }> {
    return this.request('/v1/programs');
  }

  async getTask(taskId: string): Promise<VerifyResponse> {
    return this.request<VerifyResponse>(`/v1/tasks/${taskId}`);
  }

  // ============================================================================
  // Record Methods - Trustworthy AI Outputs Ledger
  // ============================================================================

  /**
   * Get a verified output record for a task
   * Returns null if task is not finalized or doesn't exist
   */
  async getRecord(taskId: string): Promise<VerifiedOutputRecord | null> {
    try {
      const response = await this.request<RecordResponse>(
        `/api/mmv/tasks/${taskId}/record`
      );
      return response.record;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List verified output records with filtering and pagination
   * By default returns only "worthy" records (score >= 8000 bps)
   */
  async listRecords(filter: RecordQueryFilter = {}): Promise<RecordListResponse> {
    const params = new URLSearchParams();

    if (filter.min_score_bps !== undefined) {
      params.set('min_score_bps', filter.min_score_bps.toString());
    }
    if (filter.worthy_only !== undefined) {
      params.set('worthy_only', filter.worthy_only.toString());
    }
    if (filter.verdict !== undefined) {
      params.set('verdict', filter.verdict.toString());
    }
    if (filter.limit !== undefined) {
      params.set('limit', filter.limit.toString());
    }
    if (filter.offset !== undefined) {
      params.set('offset', filter.offset.toString());
    }

    const queryString = params.toString();
    const path = queryString ? `/api/mmv/records?${queryString}` : '/api/mmv/records';

    return this.request<RecordListResponse>(path);
  }

  /**
   * Verify that a record exists on-chain
   * Checks for Finalized event and returns block/tx info
   */
  async verifyRecordOnChain(taskId: string): Promise<OnChainVerifyResult> {
    return this.request<OnChainVerifyResult>(`/api/mmv/tasks/${taskId}/verify`);
  }

  // ============================================================================
  // Receipt Methods - Canonical Verification Proofs
  // ============================================================================

  /**
   * Get the verification receipt for a finalized task
   * Returns null if task is not finalized or doesn't exist
   */
  async getReceipt(taskId: string): Promise<VerificationReceipt | null> {
    try {
      const response = await this.request<ReceiptResponse>(
        `/api/mmv/tasks/${taskId}/receipt`
      );
      return response.receipt;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Wait for a task to be finalized and return the receipt
   * Polls at the specified interval until finalized or timeout
   */
  async waitForFinal(
    taskId: string,
    options: {
      pollIntervalMs?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<VerificationReceipt> {
    const pollInterval = options.pollIntervalMs ?? 5000;
    const timeout = options.timeoutMs ?? 300000; // 5 minutes default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check task status
      const task = await this.getTask(taskId);

      if (task.status === 'finalized') {
        // Task is finalized, get the receipt
        const receipt = await this.getReceipt(taskId);
        if (receipt) {
          return receipt;
        }
      }

      if (task.status === 'failed') {
        throw new Error(`Task ${taskId} failed: ${JSON.stringify(task.errors)}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timeout waiting for task ${taskId} to finalize`);
  }

  /**
   * Verify a receipt's hash against on-chain data
   * Returns verification result with detailed checks
   */
  async verifyReceiptOnChain(
    taskId: string,
    receiptHash?: string
  ): Promise<{
    verified: boolean;
    receipt_hash: string;
    chain_data?: {
      block_number: number;
      tx_hash: string;
      finalized_at: number;
    };
    errors: string[];
  }> {
    const params = new URLSearchParams();
    if (receiptHash) {
      params.set('receipt_hash', receiptHash);
    }
    const queryString = params.toString();
    const path = queryString
      ? `/api/mmv/tasks/${taskId}/receipt/verify?${queryString}`
      : `/api/mmv/tasks/${taskId}/receipt/verify`;

    return this.request(path);
  }

  private async verify(request: VerifyRequest): Promise<VerifyResponse> {
    const headers: Record<string, string> = {};
    if (request.idempotency_key) {
      headers['Idempotency-Key'] = request.idempotency_key;
    }
    return this.request<VerifyResponse>('/v1/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`MMV API error (${response.status}): ${JSON.stringify(payload)}`);
    }
    return payload as T;
  }
}
