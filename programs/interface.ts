import { EvidenceBundle } from '../shared/types';
import { VerificationReceipt } from '../shared/receipt';
import { VerificationPossibilitySpace } from '../shared/possibilitySpace';

export type EvidenceRequirement = {
  required_sections?: Array<
    | 'claims'
    | 'metrics'
    | 'provenance'
    | 'scoring_trace'
    | 'input'
    | 'output'
    | 'model_runs'
  >;
  min_model_runs?: number;
};

export type ProgramContext = {
  task_id: string;
  input_hash: `0x${string}`;
  output_hash: `0x${string}`;
  bundle_hash: `0x${string}`;
  bundle_uri: string;
  bundle_version: '0.1' | '0.2' | '0.3';
  chain_id: number;
  contract_address: `0x${string}`;
  llm_provider: string;
  llm_model: string;
  verifier_node?: string;
  software_version?: string;
  program_hash: string;
  metering?: VerificationReceipt['metering'];
  timings_ms?: {
    fetch?: number;
    program_run?: number;
    total?: number;
  };
};

export interface VerificationProgram {
  id: string;
  version: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  evidence_requirements?: EvidenceRequirement;
  scoring_rubric?: Record<string, unknown>;
  run: (bundle: EvidenceBundle, context: ProgramContext) => Promise<VerificationReceipt>;
}

export type ClaimDomain = 'empirical' | 'normative' | 'predictive' | 'aesthetic';

export type ProgramProvenance = {
  version: string;
  author: { id: string; organization?: string };
  created_at: string;
  changelog: Array<{ version: string; date: string; summary: string }>;
  evidence_admissibility_rules: string;
};

export type ProgramManifest = {
  id: string;
  version: string;
  entrypoint: string;
  claim_domain: ClaimDomain;
  program_provenance: ProgramProvenance;
  possibility_space?: VerificationPossibilitySpace;
};

export type ProgramRecord = {
  id: string;
  version: string;
  description: string;
  hash: string;
  entrypoint: string;
  program: VerificationProgram;
  manifest: ProgramManifest;
};
