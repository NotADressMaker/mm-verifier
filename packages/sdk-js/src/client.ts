import {
  ProgramDefinition,
  ProgramRecord,
  VerifyRequest,
  VerifyResponse,
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
