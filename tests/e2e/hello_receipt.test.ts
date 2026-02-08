import { execSync, spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { validateReceiptPayload, validateEvidenceBundlePayload } from '../../shared/schemaValidation';
import { hashCanonical } from '../../shared/canonicalJson';

const API_PORT = Number(process.env.E2E_API_PORT || '4100');
const API_URL = `http://localhost:${API_PORT}`;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

type ChildProcessHandle = ReturnType<typeof spawn>;

type JobRecord = {
  jobId: string;
  status: string;
  statusHistory: Array<{ status: string }>;
  scoreBps?: number;
};

function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv, name: string) {
  const child = spawn(command, args, {
    env,
    stdio: 'pipe',
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  return child;
}

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await sleep(300);
  }
  throw new Error('API did not become healthy in time');
}

async function pollJob(jobId: string, timeoutMs = 15000): Promise<JobRecord> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${API_URL}/api/jobs/${jobId}`);
    if (res.ok) {
      const body = await res.json();
      const job = body.job as JobRecord;
      if (job.status === 'completed') {
        return job;
      }
    }
    await sleep(300);
  }
  throw new Error('Job did not complete in time');
}

async function runE2E() {
  execSync('docker-compose up -d redis', { stdio: 'inherit' });

  const envBase = {
    ...process.env,
    API_PORT: API_PORT.toString(),
    API_HOST: 'localhost',
    REDIS_URL,
    MOCK_VERIFIER: 'true',
    MOCK_CHAIN: 'true',
    MOCK_SCENARIO: 'happy',
    MOCK_VERIFIER_DELAY_MS: '100',
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
  };

  const apiProcess = spawnProcess('npm', ['--prefix', 'api', 'run', 'dev'], envBase, 'api');
  const verifierProcess = spawnProcess(
    'npm',
    ['--prefix', 'verifier-node', 'run', 'dev'],
    {
      ...envBase,
      VERIFIER_NODE_ID: 'mock-node',
    },
    'verifier'
  );

  try {
    await waitForHealth();

    const submitRes = await fetch(`${API_URL}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Hello receipt',
        models: ['mock-llm'],
        taskType: 'general',
      }),
    });

    if (!submitRes.ok) {
      throw new Error(`Failed to submit job: ${submitRes.status}`);
    }

    const submitBody = await submitRes.json();
    const jobId = submitBody.jobId as string;

    const job = await pollJob(jobId);
    const history = job.statusHistory.map((entry) => entry.status);
    const hasQueued = history.includes('queued');
    const hasRunning = history.includes('running');
    const hasCompleted = history.includes('completed');

    if (!(hasQueued && hasRunning && hasCompleted)) {
      throw new Error(`Job status history missing transitions: ${history.join(', ')}`);
    }

    const receiptRes = await fetch(`${API_URL}/api/jobs/${jobId}/receipt`);
    if (!receiptRes.ok) {
      throw new Error('Receipt not available');
    }

    const receiptBody = await receiptRes.json();
    const receipt = receiptBody.receipt;

    const receiptValidation = validateReceiptPayload(receipt);
    if (!receiptValidation.valid) {
      throw new Error(`Receipt schema invalid: ${receiptValidation.errors[0]?.message}`);
    }

    const bundleRes = await fetch(`${API_URL}/api/jobs/${jobId}/bundle`);
    if (!bundleRes.ok) {
      throw new Error('Bundle not available');
    }

    const bundleBody = await bundleRes.json();
    const bundle = bundleBody.bundle;

    const bundleValidation = validateEvidenceBundlePayload(bundle);
    if (!bundleValidation.valid) {
      throw new Error(`Bundle schema invalid: ${bundleValidation.errors[0]?.message}`);
    }

    const { signatures, ...bundleWithoutSig } = bundle;
    const computedBundleHash = hashCanonical(bundleWithoutSig);

    if (computedBundleHash !== receipt.evidence.bundle_hash) {
      throw new Error('Bundle hash does not match receipt');
    }

    console.log('E2E hello receipt test passed');
  } finally {
    apiProcess.kill('SIGINT');
    verifierProcess.kill('SIGINT');
    await sleep(500);
    execSync('docker-compose down', { stdio: 'inherit' });
  }
}

runE2E().catch((error) => {
  console.error(error);
  process.exit(1);
});
