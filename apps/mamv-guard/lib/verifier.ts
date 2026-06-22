import crypto from 'node:crypto';
import { prisma } from './db';
import { createMamvClient } from './mamv';
import { decidePolicy, resolvePolicy } from './policies';
import { VerifyRequestInput } from './schemas';
import { badgeUrl, receiptUrl } from './badge';
import { deliverWebhooks } from './webhooks';

function outputText(outputs: VerifyRequestInput['outputs']) { return outputs.map((o: any) => typeof o === 'string' ? o : o.content).join('\n\n---\n\n'); }
function hash(value: unknown) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export async function verifyWithMamv(input: VerifyRequestInput) {
  const policy = resolvePolicy(input.policy);
  const prompt = `${input.prompt}\n\nAI output(s) to verify:\n${outputText(input.outputs)}`;
  const record = await prisma.verification.create({ data: { prompt: input.prompt, outputsJson: JSON.stringify(input.outputs), metadataJson: JSON.stringify(input.metadata), domain: policy.domain, policyJson: JSON.stringify(policy), thresholdBps: policy.thresholdBps, requireWorthy: policy.requireWorthy, anchorRequested: policy.anchor, status: 'PENDING' } });
  try {
    const client = createMamvClient();
    const task = await client.verifyWithProgram({ prompt, models: policy.models, taskType: policy.taskType, programId: policy.programId, programVersion: policy.programVersion, idempotencyKey: input.idempotencyKey ?? hash({ prompt, outputs: input.outputs, policy }) });
    const receipt = await client.waitForFinal(task.task_id, { timeoutMs: policy.timeoutMs, pollIntervalMs: policy.pollIntervalMs });
    const onchain = policy.anchor ? await client.verifyReceiptOnChain(task.task_id, receipt.receipt_hash).catch((error: unknown) => ({ verified: false, errors: [error instanceof Error ? error.message : String(error)] })) : undefined;
    const verdict = typeof receipt.verdict === 'boolean' ? receipt.verdict : false;
    const decision = decidePolicy(receipt.score_bps, verdict, policy, { anchorVerified: onchain?.verified, anchorErrors: onchain?.errors });
    const status = decision.decision === 'error' ? 'FAILED' : decision.decision === 'rejected' ? 'REJECTED' : decision.decision === 'manual_review' ? 'MANUAL_REVIEW' : 'VERIFIED';
    const updated = await prisma.verification.update({ where: { id: record.id }, data: { taskId: task.task_id, status, policyDecision: decision.decision, policyWarningsJson: JSON.stringify(decision.warnings), anchorVerified: onchain?.verified, verdict, worthy: decision.worthy, scoreBps: receipt.score_bps, receiptJson: JSON.stringify(receipt), evidenceJson: JSON.stringify(receipt.evidence), receiptHash: receipt.receipt_hash, receiptUrl: receiptUrl(record.id), badgeUrl: badgeUrl(record.id), chainId: receipt.chain_context?.chain_id, contractAddress: receipt.chain_context?.contract_address, txHash: onchain?.chain_data?.tx_hash, blockNumber: onchain?.chain_data?.block_number } });
    const response = toPublicResult(updated);
    if (policy.webhooks.length) await deliverWebhooks(record.id, policy.webhooks, response);
    return response;
  } catch (error) {
    const updated = await prisma.verification.update({ where: { id: record.id }, data: { status: 'FAILED', policyDecision: 'error', error: error instanceof Error ? error.message : String(error) } });
    return toPublicResult(updated);
  }
}

export function toPublicResult(v: any) {
  return { id: v.id, taskId: v.taskId, status: v.status, policyDecision: v.policyDecision, policyWarnings: v.policyWarningsJson ? JSON.parse(v.policyWarningsJson) : [], verdict: v.verdict, worthy: v.worthy, scoreBps: v.scoreBps, thresholdBps: v.thresholdBps, receiptHash: v.receiptHash, receiptUrl: v.receiptUrl, badgeUrl: v.badgeUrl, anchor: { requested: v.anchorRequested, verified: v.anchorVerified, chainId: v.chainId, contractAddress: v.contractAddress, txHash: v.txHash, blockNumber: v.blockNumber }, disclaimers: ['MAMV confidence reflects verification quality, not guaranteed correctness.', 'Onchain anchoring proves this receipt is timestamped and unchanged. It does not guarantee the AI output is correct.', 'MAMV verifies the AI output. Blockchain verifies the MAMV receipt.'], error: v.error, createdAt: v.createdAt, updatedAt: v.updatedAt };
}
