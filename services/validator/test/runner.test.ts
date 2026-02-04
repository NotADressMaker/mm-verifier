import { runCommand } from '../src/runner';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

describe('runner', () => {
  it('captures stdout within limits', async () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const close = new EventEmitter();

    (spawn as jest.Mock).mockReturnValue({
      stdout,
      stderr,
      on: close.on.bind(close),
      kill: jest.fn(),
    });

    const promise = runCommand('bash', ['-lc', 'echo test'], undefined, {
      timeoutMs: 1000,
      maxOutputBytes: 1000,
    });

    stdout.emit('data', Buffer.from('ok'));
    close.emit('close', 0);

    const result = await promise;
    expect(result.stdout).toBe('ok');
    expect(result.exitCode).toBe(0);
  });
});
