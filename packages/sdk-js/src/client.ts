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
} from './types';

export interface MMVClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetcher?: typeof fetch;
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

  constructor(options: MMVClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
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
