import type { VerificationReceipt, EvidenceBundle as SharedEvidenceBundle } from '../../../shared/schemaTypes';

export type JobRecord = {
  jobId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  prompt?: string;
  promptHash: string;
  models: string[];
  taskType: string;
  programId?: string;
  programVersion?: string;
  statusHistory?: Array<{ status: string; timestamp: string }>;
  scoreBps?: number;
  verdict?: boolean;
  storage_mode?: 'hashed-only' | 'encrypted';
};

export type Receipt = VerificationReceipt;

export type EvidenceBundle = SharedEvidenceBundle;

export type DisputeEvent = {
  id: string;
  type: string;
  status: string;
  timestamp: string;
  summary: string;
};

export type DebugTraceStage = {
  name: string;
  start_ms: number;
  end_ms?: number;
  duration_ms?: number;
  status: string;
  outputs?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
  };
};

export type DebugTrace = {
  trace_id: string;
  task_id: string;
  stages: DebugTraceStage[];
};
