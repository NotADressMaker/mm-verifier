const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  return result;
}

function readEnvValue(filePath, key) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const line = contents.split('\n').find((row) => row.startsWith(`${key}=`));
  return line ? line.split('=').slice(1).join('=').trim() : null;
}

(function testQuickstartEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmv-quickstart-'));
  const envFile = path.join(tmpDir, '.env.runtime');

  const result = run('bash', ['quickstart.sh', '--env-only'], {
    cwd: repoRoot,
    env: { ...process.env, QUICKSTART_ENV_FILE: envFile },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.strictEqual(readEnvValue(envFile, 'MOCK_VERIFIER'), 'true');
  assert.strictEqual(readEnvValue(envFile, 'MOCK_PROVIDERS'), 'true');
  assert.strictEqual(readEnvValue(envFile, 'PROVIDER_MODE'), 'mock');
  assert.strictEqual(readEnvValue(envFile, 'CHAIN_MODE'), 'mock');
  assert.strictEqual(readEnvValue(envFile, 'HASHED_ONLY_DEFAULT'), 'true');
})();

(function testDoctorRealModeMissingEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmv-doctor-'));
  const envFile = path.join(tmpDir, '.env.runtime');

  fs.writeFileSync(
    envFile,
    [
      'MOCK_VERIFIER=false',
      'MOCK_PROVIDERS=false',
      'PROVIDER_MODE=real',
      'CHAIN_MODE=real',
      'API_PORT=3999',
    ].join('\n')
  );

  const result = run('node', ['tools/doctor.js', '--env-file', envFile], {
    cwd: repoRoot,
  });

  assert.notStrictEqual(result.status, 0, 'Doctor should fail when required env vars are missing');
  assert.ok(
    result.stdout.includes('Real mode env') || result.stderr.includes('Real mode env'),
    'Doctor output should mention missing real mode env'
  );
})();

console.log('Tooling tests passed');
