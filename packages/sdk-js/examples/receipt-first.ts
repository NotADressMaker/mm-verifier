import { MAMVClient } from '../src';

async function main() {
  const client = new MAMVClient({ baseUrl: process.env.MAMV_API_URL ?? 'http://localhost:3000' });

  // 1) Verify an AI answer.
  const task = await client.verifyText({
    prompt: 'AI answer to check: The James Webb Space Telescope launched on December 25, 2021.',
    models: ['mock-llm'],
    taskType: 'factual-qa',
    idempotencyKey: 'receipt-first-demo',
  });

  // 2) Get the receipt and display public status.
  const receipt = await client.getReceipt(task.task_id);
  if (!receipt) throw new Error('Receipt was not available yet. Poll or call waitForFinal in production.');

  console.log('Receipt:', receipt.receipt_id ?? receipt.task_id);
  console.log('Status:', receipt.verification_status ?? (receipt.verdict ? 'Likely' : 'Unverified'));
  console.log('Confidence:', receipt.confidence_score ?? receipt.score_bps / 10000);
  console.log('Warnings:', receipt.warnings ?? receipt.explain.checks_fired);

  // 3) Verify later. In production compare the receipt hash/signature and optional anchor data.
  const chainCheck = await client.verifyReceiptOnChain(receipt.task_id, receipt.receipt_hash);
  console.log('Tamper-evident anchor check:', chainCheck.verified);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
