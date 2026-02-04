export type ValidationPluginType = 'deterministic' | 'test-suite' | 'tee_or_zk';

export type ValidationVerdict = 'PASS' | 'FAIL' | 'PARTIAL';

export interface ValidationLimits {
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface DeterministicRequestPayload {
  runner: 'node' | 'python' | 'bash';
  command: string;
  inputHash: string;
  expectedOutputHash?: string;
  expectedOutputHashes?: string[];
  outputSplitter?: 'newline' | 'json-array';
  limits?: ValidationLimits;
}

export interface TestSuiteRequestPayload {
  workspacePath?: string;
  repoUrl?: string;
  commit?: string;
  testsCommand: string;
  expectedArtifactsHash?: string;
  artifactsPath?: string;
  limits?: ValidationLimits;
}

export interface TeeOrZkRequestPayload {
  proofURI: string;
  proofHash: string;
  attestationType: 'TEE' | 'ZK';
  verifierKeyId: string;
}

export type ValidationRequestPayload =
  | DeterministicRequestPayload
  | TestSuiteRequestPayload
  | TeeOrZkRequestPayload;

export interface MmvValidationRequest {
  requestId: string;
  createdAt: string;
  plugin: ValidationPluginType;
  payload: ValidationRequestPayload;
  workHash: string;
  proofHash?: string;
  requesterId?: string;
  tags?: string[];
}

export interface MmvResult {
  score0to100: number;
  verdict: ValidationVerdict;
  tag: string;
  receiptURI: string;
  receiptHash: string;
  detailsHash: string;
}

export interface ValidationReceipt {
  receiptId: string;
  requestId: string;
  plugin: ValidationPluginType;
  timestamp: string;
  verdict: ValidationVerdict;
  score: number;
  tag: string;
  receiptHash: string;
  logsHash: string;
  environmentHash: string;
  validatorId: string;
  workHash: string;
  proofHash?: string;
  receiptURI: string;
}

export interface ValidatorSummary {
  validatorId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  totalValidations: number;
  failureCount: number;
  passCount: number;
  partialCount: number;
}
