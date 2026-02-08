#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const userAgent = process.env.npm_config_user_agent || '';

function fail(message) {
  console.error(`\n[preflight] ${message}`);
  process.exit(1);
}

if (userAgent.includes('yarn')) {
  fail('This repo uses npm. Please rerun using npm install.');
}

if (userAgent.includes('pnpm')) {
  fail('This repo uses npm. Please rerun using npm install.');
}

const lockFiles = ['pnpm-lock.yaml', 'yarn.lock'];
for (const lockFile of lockFiles) {
  if (fs.existsSync(path.join(root, lockFile))) {
    fail(`Found ${lockFile}. Please remove it and use npm with package-lock.json.`);
  }
}

if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
  fail('package-lock.json is required. Run npm install to regenerate it.');
}

console.log('[preflight] npm package manager check passed.');
