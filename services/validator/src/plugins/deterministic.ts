import { VerifierPlugin } from './types';
import {
  DeterministicRequestPayload,
  MmvValidationRequest,
  MmvResult,
} from '../../../../shared/validationTypes';
import { config } from '../config';
import { hashDetails, hashOutput } from '../hash';
import { runCommand } from '../runner';

const DEFAULT_LIMITS = {
  timeoutMs: 60000,
  maxOutputBytes: 20000,
};

function getCommandSpec(payload: DeterministicRequestPayload): { command: string; args: string[] } {
  if (payload.runner === 'bash') {
    return { command: 'bash', args: ['-lc', payload.command] };
  }
  if (payload.runner === 'python') {
    return { command: 'python', args: ['-c', payload.command] };
  }
  return { command: 'node', args: ['-e', payload.command] };
}

function scoreFromMatches(total: number, matched: number): { verdict: 'PASS' | 'FAIL' | 'PARTIAL'; score: number } {
  if (total === 0) {
    return { verdict: 'FAIL', score: 0 };
  }
  if (matched === total) {
    return { verdict: 'PASS', score: 100 };
  }
  if (matched === 0) {
    return { verdict: 'FAIL', score: 0 };
  }
  const score = Math.round((matched / total) * 100);
  return { verdict: 'PARTIAL', score };
}

function deriveOutputs(output: string, splitter?: 'newline' | 'json-array'): string[] {
  if (splitter === 'json-array') {
    try {
      const parsed = JSON.parse(output.trim());
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value));
      }
    } catch {
      return [output];
    }
  }
  return output.split('\n').filter((line) => line.length > 0);
}

export const deterministicPlugin: VerifierPlugin = {
  name: 'deterministic',
  canHandle(request: MmvValidationRequest): boolean {
    return request.plugin === 'deterministic';
  },
  async verify(request: MmvValidationRequest): Promise<MmvResult> {
    const payload = request.payload as DeterministicRequestPayload;
    const limits = {
      timeoutMs: payload.limits?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
      maxOutputBytes: payload.limits?.maxOutputBytes ?? DEFAULT_LIMITS.maxOutputBytes,
    };
    const commandSpec = getCommandSpec(payload);
    const result = await runCommand(commandSpec.command, commandSpec.args, process.cwd(), limits);
    const outputHash = hashOutput(result.stdout);

    const expectedHashes = payload.expectedOutputHashes ?? (payload.expectedOutputHash ? [payload.expectedOutputHash] : []);
    const outputs = expectedHashes.length > 1 ? deriveOutputs(result.stdout, payload.outputSplitter) : [result.stdout];
    const outputHashes = outputs.map((value) => hashOutput(value));
    const matched = expectedHashes.length > 0
      ? outputHashes.filter((hash) => expectedHashes.includes(hash)).length
      : 0;
    const scoreResult = scoreFromMatches(expectedHashes.length || 1, matched);
    const effectiveScore = result.exitCode === 0 && !result.timedOut ? scoreResult : { verdict: 'FAIL', score: 0 };

    const details = {
      runner: payload.runner,
      command: payload.command,
      outputHash,
      expectedOutputHash: payload.expectedOutputHash,
      expectedOutputHashes: payload.expectedOutputHashes,
      outputHashes,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stderr: result.stderr,
      inputHash: payload.inputHash,
    };

    const detailsHash = hashDetails(details);
    const receiptURI = `${config.receiptBaseUrl}/receipts/${request.requestId}`;

    return {
      score0to100: effectiveScore.score,
      verdict: effectiveScore.verdict,
      tag: 'deterministic-reexec',
      receiptURI,
      receiptHash: detailsHash,
      detailsHash,
    };
  },
};
