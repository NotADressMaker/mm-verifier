import type { VerificationReceipt, EvidenceBundle as SharedEvidenceBundle } from '../../../shared/schemaTypes';

export type JobRecord = {
  jobId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  promptHash: string;
  models: string[];
  taskType: string;
  programId?: string;
  programVersion?: string;
  statusHistory?: Array<{ status: string; timestamp: string }>;
  scoreBps?: number;
  verdict?: boolean;
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
