import fs from 'fs';
import path from 'path';
import os from 'os';
import { VerifierPlugin } from './types';
import {
  MmvValidationRequest,
  MmvResult,
  TestSuiteRequestPayload,
} from '../../../../shared/validationTypes';
import { config } from '../config';
import { hashDetails, hashOutput } from '../hash';
import { runCommand } from '../runner';

const DEFAULT_LIMITS = {
  timeoutMs: 120000,
  maxOutputBytes: 40000,
};

async function prepareWorkspace(payload: TestSuiteRequestPayload): Promise<string> {
  if (payload.workspacePath) {
    return payload.workspacePath;
  }

  if (!payload.repoUrl || !payload.commit) {
    throw new Error('repoUrl and commit are required when workspacePath is not provided');
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mamv-test-suite-'));
  const cloneResult = await runCommand('git', ['clone', payload.repoUrl, workspace], undefined, {
    timeoutMs: 120000,
    maxOutputBytes: 20000,
  });
  if (cloneResult.exitCode !== 0 || cloneResult.timedOut) {
    throw new Error('Failed to clone repository');
  }
  const checkoutResult = await runCommand('git', ['checkout', payload.commit], workspace, {
    timeoutMs: 120000,
    maxOutputBytes: 20000,
  });
  if (checkoutResult.exitCode !== 0 || checkoutResult.timedOut) {
    throw new Error('Failed to checkout commit');
  }
  return workspace;
}

function hashArtifacts(artifactsPath: string): string {
  const entries: Array<{ file: string; hash: string }> = [];

  const walk = (dir: string) => {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else {
        const content = fs.readFileSync(fullPath, 'utf8');
        entries.push({ file: path.relative(artifactsPath, fullPath), hash: hashOutput(content) });
      }
    }
  };

  walk(artifactsPath);
  entries.sort((a, b) => a.file.localeCompare(b.file));
  return hashOutput(JSON.stringify(entries));
}

export const testSuitePlugin: VerifierPlugin = {
  name: 'test-suite',
  canHandle(request: MmvValidationRequest): boolean {
    return request.plugin === 'test-suite';
  },
  async verify(request: MmvValidationRequest): Promise<MmvResult> {
    const payload = request.payload as TestSuiteRequestPayload;
    const limits = {
      timeoutMs: payload.limits?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
      maxOutputBytes: payload.limits?.maxOutputBytes ?? DEFAULT_LIMITS.maxOutputBytes,
    };

    const workspace = await prepareWorkspace(payload);
    const result = await runCommand('bash', ['-lc', payload.testsCommand], workspace, limits);

    let verdict: 'PASS' | 'FAIL' = result.exitCode === 0 && !result.timedOut ? 'PASS' : 'FAIL';
    let score = verdict === 'PASS' ? 100 : 0;

    let artifactsHash: string | undefined;
    if (payload.expectedArtifactsHash && payload.artifactsPath) {
      const fullArtifactsPath = path.isAbsolute(payload.artifactsPath)
        ? payload.artifactsPath
        : path.join(workspace, payload.artifactsPath);
      artifactsHash = hashArtifacts(fullArtifactsPath);
      if (artifactsHash !== payload.expectedArtifactsHash) {
        verdict = 'FAIL';
        score = 0;
      }
    }

    const details = {
      workspace,
      testsCommand: payload.testsCommand,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stderr: result.stderr,
      artifactsHash,
      expectedArtifactsHash: payload.expectedArtifactsHash,
    };

    const detailsHash = hashDetails(details);
    const receiptURI = `${config.receiptBaseUrl}/receipts/${request.requestId}`;

    return {
      score0to100: score,
      verdict,
      tag: 'test-suite',
      receiptURI,
      receiptHash: detailsHash,
      detailsHash,
    };
  },
};
