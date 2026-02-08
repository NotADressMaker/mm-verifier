import { createHash } from 'crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { canonicalize } from './canonicalJson';
import { EvidenceBundle } from './types';

export type BundleHashAlgorithm = 'keccak256' | 'sha256';

function normalizeNewlines(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeNewlines(item));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = normalizeNewlines(entry);
    }
    return output;
  }

  if (typeof value === 'string') {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  return value;
}

export function canonicalizeBundle(bundle: EvidenceBundle): Buffer {
  const normalized = normalizeNewlines(bundle);
  const canonicalJson = canonicalize(normalized);
  return Buffer.from(canonicalJson, 'utf8');
}

export function computeBundleHash(
  bundle: EvidenceBundle,
  algorithm: BundleHashAlgorithm = 'keccak256'
): `0x${string}` {
  const canonicalBytes = canonicalizeBundle(bundle);

  if (algorithm === 'sha256') {
    const digest = createHash('sha256').update(canonicalBytes).digest('hex');
    return `0x${digest}`;
  }

  return keccak256(canonicalBytes) as `0x${string}`;
}

export function verifyTranscript(bundle: EvidenceBundle): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [index, run] of bundle.model_runs.entries()) {
    if (typeof run.raw_output === 'string') {
      const recomputed = keccak256(toUtf8Bytes(run.raw_output));
      if (recomputed !== run.output_hash) {
        errors.push(`model_runs[${index}].output_hash mismatch`);
      }
    }
  }

  if ('replay' in bundle && bundle.replay) {
    const replay = bundle.replay;
    const transcript = replay.transcript;

    if (transcript?.messages && transcript.message_hashes?.messages_hash) {
      const messagesHash = keccak256(
        toUtf8Bytes(
          canonicalize(transcript.messages.map((message) => normalizeNewlines(message)))
        )
      );
      if (messagesHash !== transcript.message_hashes.messages_hash) {
        errors.push('replay.transcript.message_hashes.messages_hash mismatch');
      }
    }

    if (transcript?.outputs && transcript.output_hashes?.outputs_hash) {
      const outputsHash = keccak256(
        toUtf8Bytes(
          canonicalize(transcript.outputs.map((output) => normalizeNewlines(output)))
        )
      );
      if (outputsHash !== transcript.output_hashes.outputs_hash) {
        errors.push('replay.transcript.output_hashes.outputs_hash mismatch');
      }
    }

    const expected = replay.replay_recipe?.replay_expected;
    if (expected?.prompt_hash && expected.prompt_hash !== bundle.prompt_hash) {
      errors.push('replay.replay_recipe.replay_expected.prompt_hash mismatch');
    }

    if (expected?.output_hash && bundle.model_runs[0]) {
      const primaryOutput = bundle.model_runs[0].output_hash;
      if (expected.output_hash !== primaryOutput) {
        errors.push('replay.replay_recipe.replay_expected.output_hash mismatch');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
