#!/usr/bin/env node
const fs = require('fs');
const net = require('net');
const path = require('path');
const { URL } = require('url');

const argv = process.argv.slice(2);
let envFile = path.resolve(process.cwd(), '.env.runtime');

for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--env-file') {
    envFile = path.resolve(process.cwd(), argv[i + 1]);
    i += 1;
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const contents = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of contents.split('\n')) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

const fileEnv = parseEnvFile(envFile);
const env = { ...fileEnv, ...process.env };

const results = [];
function addResult(status, title, detail) {
  results.push({ status, title, detail });
}

function logResults() {
  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${result.title}${result.detail ? ` - ${result.detail}` : ''}`);
  }
}

function isHexAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || '');
}

async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 800);
    socket.once('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    socket.connect(port, '127.0.0.1', () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    });
  });
}

async function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function checkRedis(url) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);

    socket.connect(url.port, url.hostname, () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });

    socket.on('data', (data) => {
      clearTimeout(timeout);
      socket.end();
      resolve(data.toString().startsWith('+PONG'));
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function checkJsonRpc(url) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.result || null;
  } catch {
    return null;
  }
}

async function checkHttp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

function getEnv(name, fallback) {
  return env[name] !== undefined ? env[name] : fallback;
}

async function run() {
  const mockVerifier = getEnv('MOCK_VERIFIER', 'true') === 'true';
  const mockProviders = getEnv('MOCK_PROVIDERS', 'true') === 'true';
  const mockChain = getEnv('MOCK_CHAIN', 'true') === 'true';
  const providerMode = getEnv('PROVIDER_MODE', mockProviders ? 'mock' : 'real');
  const chainMode = getEnv('CHAIN_MODE', mockChain ? 'mock' : 'real');
  const realMode = !mockVerifier || providerMode === 'real' || chainMode === 'real';

  if (!realMode) {
    if (!mockVerifier) addResult('fail', 'Mock mode flag', 'MOCK_VERIFIER should be true in mock mode');
    if (!mockProviders) addResult('fail', 'Mock mode flag', 'MOCK_PROVIDERS should be true in mock mode');
    if (getEnv('HASHED_ONLY_DEFAULT', 'true') !== 'true') {
      addResult('fail', 'Mock mode flag', 'HASHED_ONLY_DEFAULT should be true in mock mode');
    }
    if (results.length === 0) {
      addResult('pass', 'Mock mode flags', 'Mock flags are set');
    }
  } else {
    const missing = [];
    if (!getEnv('ARBITRUM_SEPOLIA_RPC_URL', '')) missing.push('ARBITRUM_SEPOLIA_RPC_URL');
    if (!getEnv('MARKETPLACE_ADDRESS', '')) missing.push('MARKETPLACE_ADDRESS');
    if (!getEnv('STAKING_ADDRESS', '')) missing.push('STAKING_ADDRESS');
    if (!getEnv('PRIVATE_KEY', '')) missing.push('PRIVATE_KEY');
    if (!getEnv('VERIFIER_PRIVATE_KEY', '')) missing.push('VERIFIER_PRIVATE_KEY');

    const providerKeys = [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GOOGLE_API_KEY',
      'COHERE_API_KEY',
      'HUGGINGFACE_API_KEY',
    ];
    if (!providerKeys.some((key) => getEnv(key, ''))) {
      missing.push('At least one provider API key');
    }

    if (missing.length) {
      addResult('fail', 'Real mode env', `Missing: ${missing.join(', ')}`);
    } else {
      addResult('pass', 'Real mode env', 'Required environment variables present');
    }

    if (!isHexAddress(getEnv('MARKETPLACE_ADDRESS', ''))) {
      addResult('fail', 'Contract address', 'MARKETPLACE_ADDRESS must be a 0x-prefixed 40-byte hex');
    } else {
      addResult('pass', 'Contract address', 'MARKETPLACE_ADDRESS looks valid');
    }
    if (!isHexAddress(getEnv('STAKING_ADDRESS', ''))) {
      addResult('fail', 'Contract address', 'STAKING_ADDRESS must be a 0x-prefixed 40-byte hex');
    } else {
      addResult('pass', 'Contract address', 'STAKING_ADDRESS looks valid');
    }
  }

  const apiPort = Number(getEnv('API_PORT', '3000'));
  const dashboardPort = Number(getEnv('DASHBOARD_PORT', '5173'));
  const redisUrlValue = getEnv('REDIS_URL', 'redis://localhost:6379');
  const metricsPort = Number(getEnv('METRICS_PORT', '9101'));

  for (const [name, port] of [
    ['API', apiPort],
    ['Dashboard', dashboardPort],
    ['Verifier metrics', metricsPort],
  ]) {
    const reachable = await checkPort(port);
    if (reachable) {
      addResult('pass', `${name} port`, `Port ${port} is reachable`);
    } else if (await portIsFree(port)) {
      addResult('pass', `${name} port`, `Port ${port} is free`);
    } else {
      addResult('fail', `${name} port`, `Port ${port} is in use but not reachable`);
    }
  }

  try {
    const redisUrl = new URL(redisUrlValue);
    const redisOk = await checkRedis(redisUrl);
    if (redisOk) {
      addResult('pass', 'Redis', 'PONG received');
    } else {
      addResult('fail', 'Redis', `Unable to reach ${redisUrlValue}`);
    }
  } catch {
    addResult('fail', 'Redis', 'REDIS_URL is invalid');
  }

  const rpcUrl = getEnv('ARBITRUM_SEPOLIA_RPC_URL', '');
  if (rpcUrl) {
    const chainId = await checkJsonRpc(rpcUrl);
    if (chainId) {
      addResult('pass', 'RPC', `Chain ID ${chainId}`);
    } else {
      addResult('fail', 'RPC', `Failed to reach ${rpcUrl}`);
    }
  } else {
    addResult('warn', 'RPC', 'ARBITRUM_SEPOLIA_RPC_URL not set');
  }

  const apiHealthOk = await checkHttp(`http://localhost:${apiPort}/health`);
  addResult(apiHealthOk ? 'pass' : 'fail', 'API health', apiHealthOk ? 'Healthy' : 'GET /health failed');

  const verifierHealthOk = await checkHttp(`http://localhost:${metricsPort}/metrics`);
  addResult(
    verifierHealthOk ? 'pass' : 'fail',
    'Verifier-node health',
    verifierHealthOk ? 'Metrics endpoint reachable' : 'GET /metrics failed'
  );

  logResults();

  const failed = results.filter((result) => result.status === 'fail');
  if (failed.length) {
    console.error(`\nDoctor found ${failed.length} issue(s). Fix the failures above and re-run.`);
    process.exit(1);
  }
  console.log('\nDoctor checks passed.');
}

run();
