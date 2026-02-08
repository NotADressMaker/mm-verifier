import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { CheckerResult } from './types';

const execFileAsync = promisify(execFile);

export interface CodeExecutionInput {
  code: string;
  language?: 'python';
  timeoutMs?: number;
}

const BLOCKED_PATTERNS = [
  /import\s+os/,
  /import\s+sys/,
  /import\s+socket/,
  /import\s+subprocess/,
  /import\s+requests/,
  /open\s*\(/,
  /exec\s*\(/,
  /eval\s*\(/,
];

export async function codeExecutionChecker(
  input: CodeExecutionInput
): Promise<CheckerResult> {
  const language = input.language ?? 'python';
  const timeoutMs = input.timeoutMs ?? 2000;

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(input.code)) {
      return {
        name: 'code_execution_checker',
        status: 'fail',
        score_bps: 0,
        findings: {
          reason: 'blocked_pattern',
          pattern: pattern.toString(),
        },
      };
    }
  }

  if (language !== 'python') {
    return {
      name: 'code_execution_checker',
      status: 'skipped',
      score_bps: 0,
      findings: {
        reason: 'unsupported_language',
        language,
      },
    };
  }

  try {
    const result = await execFileAsync(
      'python3',
      ['-I', '-c', input.code],
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          PYTHONNOUSERSITE: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
      }
    );

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const outputHash = createHash('sha256').update(output).digest('hex');

    return {
      name: 'code_execution_checker',
      status: 'pass',
      score_bps: 10000,
      output_hash: `0x${outputHash}`,
      findings: {
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  } catch (error: any) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const outputHash = createHash('sha256').update(output).digest('hex');

    return {
      name: 'code_execution_checker',
      status: 'fail',
      score_bps: 0,
      output_hash: `0x${outputHash}`,
      findings: {
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr,
      },
    };
  }
}
