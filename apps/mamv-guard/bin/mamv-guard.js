#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
const program = new Command();
program.name('mamv-guard').description('Verify AI outputs with MAMV-Guard').version('0.1.0');
program.command('verify').argument('<input>', 'JSON file containing prompt, outputs, metadata, and optional policy').option('--threshold <bps>', 'minimum score in basis points', (v) => Number(v)).option('--anchor', 'require on-chain anchoring').option('--api <url>', 'MAMV-Guard API base URL', process.env.MAMV_GUARD_BASE_URL ?? 'http://localhost:3000').action(async (input, options) => { const payload = JSON.parse(await readFile(input, 'utf8')); payload.policy = { ...(payload.policy ?? {}), ...(options.threshold ? { thresholdBps: options.threshold } : {}), ...(options.anchor ? { anchor: true } : {}) }; const res = await fetch(`${options.api.replace(/\/$/, '')}/api/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const body = await res.json(); console.log(JSON.stringify(body, null, 2)); process.exit(res.ok && ['approved', 'approved_with_warning'].includes(body.policyDecision) ? 0 : 1); });
program.parse();
