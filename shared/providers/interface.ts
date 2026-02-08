import { TraceContext } from '../observability/tracing';

export type ProviderRequest = {
  prompt: string;
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  system_prompt?: string;
  request_id?: string;
  trace?: TraceContext;
};

export type ProviderCallResult = {
  provider_id: string;
  model_name: string;
  model_version?: string;
  model_commitment_hash?: string;
  latency_ms: number;
  tokens_in?: number;
  tokens_out?: number;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  system_prompt_hash?: string;
  request_id?: string;
  provider_request_id?: string;
  raw_response?: unknown;
  normalized_text: string;
  retries?: number;
  status: 'ok' | 'error';
  error?: string;
  error_type?: string;
};

export type NormalizedResponse = {
  text: string;
};
