import { spawn } from 'child_process';

export interface RunnerLimits {
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface RunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string | undefined,
  limits: RunnerLimits
): Promise<RunnerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        MAMV_NETWORK_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let exceeded = false;
    const maxBytes = limits.maxOutputBytes;

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        stdout,
        stderr,
        exitCode: null,
        timedOut: true,
      });
    }, limits.timeoutMs);

    child.stdout.on('data', (data: Buffer) => {
      if (exceeded) {
        return;
      }
      stdout += data.toString('utf8');
      if (Buffer.byteLength(stdout) > maxBytes) {
        exceeded = true;
        child.kill('SIGKILL');
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      if (exceeded) {
        return;
      }
      stderr += data.toString('utf8');
      if (Buffer.byteLength(stderr) > maxBytes) {
        exceeded = true;
        child.kill('SIGKILL');
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut: false,
      });
    });
  });
}
