import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { EvidenceBundle } from '../../../shared/types';
import { hashCanonical } from '../../../shared/canonicalJson';
import { ProgramContext } from '../../../programs/interface';
import { getChainIdFromEnv } from '../../../shared/env';

export type EvidenceLoadOptions = {
  allowRemote?: boolean;
};

export function stripEvidenceSignatures(bundle: EvidenceBundle): Omit<EvidenceBundle, 'signatures'> {
  const { signatures, ...rest } = bundle as EvidenceBundle & { signatures?: unknown };
  return rest as Omit<EvidenceBundle, 'signatures'>;
}

export function computeEvidenceHash(bundle: EvidenceBundle): string {
  return hashCanonical(stripEvidenceSignatures(bundle));
}

export async function loadEvidenceBundle(
  source: string,
  options: EvidenceLoadOptions = {}
): Promise<EvidenceBundle> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    if (!options.allowRemote) {
      throw new Error('Remote evidence fetch disabled (set MMV_AUDITOR_ALLOW_NETWORK=true)');
    }
    const response = await axios.get(source, { timeout: 10_000 });
    return response.data as EvidenceBundle;
  }

  if (source.startsWith('ipfs://')) {
    if (!options.allowRemote) {
      throw new Error('IPFS fetch disabled (set MMV_AUDITOR_ALLOW_NETWORK=true)');
    }
    const gatewayUrl = `https://ipfs.io/ipfs/${source.replace('ipfs://', '')}`;
    const response = await axios.get(gatewayUrl, { timeout: 10_000 });
    return response.data as EvidenceBundle;
  }

  const filePath = source.startsWith('file://') ? source.replace('file://', '') : source;
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(resolved, 'utf8');
  return JSON.parse(raw) as EvidenceBundle;
}

export function buildProgramContext(
  bundle: EvidenceBundle,
  options: {
    programHash: string;
    contractAddress: string;
    bundleUri?: string;
  }
): ProgramContext {
  const bundleVersion = bundle.bundle_version ?? '0.1';
  const inputHash =
    (bundle as any).input?.content_hash ??
    (bundle as any).prompt_hash ??
    (bundle.model_runs?.[0] as any)?.prompt_hash ??
    '0x0000000000000000000000000000000000000000000000000000000000000000';
  const outputHash =
    (bundle as any).output?.content_hash ??
    (bundle.model_runs?.[0] as any)?.response_hash ??
    inputHash;

  const modelRun = bundle.model_runs?.[0];
  const chainId = getChainIdFromEnv() ?? 0;

  return {
    task_id: String(bundle.task_id ?? ''),
    input_hash: inputHash,
    output_hash: outputHash,
    bundle_hash: computeEvidenceHash(bundle) as `0x${string}`,
    bundle_uri: options.bundleUri ?? '',
    bundle_version: bundleVersion,
    chain_id: chainId,
    contract_address: options.contractAddress as `0x${string}`,
    llm_provider: modelRun?.provider ?? 'unknown',
    llm_model: modelRun?.model ?? 'unknown',
    program_hash: options.programHash,
  };
}

export function assertScoreBps(scoreBps: number): void {
  if (!Number.isFinite(scoreBps) || scoreBps < 0 || scoreBps > 10_000) {
    throw new Error('score-bps must be between 0 and 10000');
  }
}

export function verifyEvidenceHash({
  computed,
  expected,
  chainExpected,
}: {
  computed: string;
  expected?: string;
  chainExpected?: string;
}): void {
  if (expected && computed.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Evidence hash mismatch: computed=${computed} expected=${expected}`);
  }
  if (chainExpected && computed.toLowerCase() !== chainExpected.toLowerCase()) {
    throw new Error(`Evidence hash does not match chain commitment: ${chainExpected}`);
  }
}
