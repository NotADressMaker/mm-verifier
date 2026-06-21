/**
 * Agent Receipt Verification Demo
 *
 * This example demonstrates how an AI agent can:
 * 1. Submit a verification request
 * 2. Wait for the receipt
 * 3. Verify the receipt against on-chain data
 * 4. Make decisions based on the verification result
 */

import { MAMVClient } from '../packages/sdk-js/src/client';
import {
  computeReceiptHash,
  validateReceipt,
  VerificationReceipt,
} from '../shared/receipt';
import {
  computeProgramFingerprint,
  ProgramDefinitionWithLimits,
} from '../shared/programs';

// Configuration
const MAMV_API_URL = process.env.MAMV_API_URL || process.env.MMV_API_URL || 'http://localhost:3000';
const MAMV_API_KEY = process.env.MAMV_API_KEY || process.env.MMV_API_KEY || '';

// Initialize client
const client = new MAMVClient({
  baseUrl: MAMV_API_URL,
  apiKey: MAMV_API_KEY,
});

// Define a custom verification program
const agentProgram: ProgramDefinitionWithLimits = {
  name: 'agent-safety-check',
  version: '1.0.0',
  description: 'Verify agent outputs before execution',
  steps: [
    {
      type: 'prompt',
      description: 'Query multiple models for consensus',
      config: { temperature: 0.1 },
    },
    {
      type: 'cross-check',
      description: 'Compare model outputs for consistency',
    },
    {
      type: 'score',
      description: 'Score the verification result',
    },
  ],
  scoring: {
    method: 'weighted_sum',
    components: [
      { id: 'consistency', weight_bps: 4000 },
      { id: 'agreement', weight_bps: 3000 },
      { id: 'citation_quality', weight_bps: 2000 },
      { id: 'factual_accuracy', weight_bps: 1000 },
    ],
  },
  thresholds: {
    pass_bps: 5000,
    worthy_bps: 8000,
  },
  receipt: {
    schema_version: '1',
    receipt_version: '1.0.0',
    explain_version: '1.0.0',
  },
  limits: {
    max_llm_calls: 5,
    max_total_tokens: 50000,
    max_execution_ms: 60000,
  },
};

/**
 * Simulated agent action that requires verification
 */
interface AgentAction {
  type: 'answer' | 'execute' | 'recommend';
  content: string;
  confidence: number;
}

/**
 * Demo: Agent verifies its output before acting
 */
async function agentWithVerification(userQuery: string): Promise<AgentAction> {
  console.log('\n=== Agent Verification Demo ===\n');
  console.log(`User Query: "${userQuery}"`);

  // Step 1: Compute program fingerprint
  const fingerprint = computeProgramFingerprint(agentProgram);
  console.log(`\nProgram: ${agentProgram.name} v${agentProgram.version}`);
  console.log(`Fingerprint: ${fingerprint.slice(0, 18)}...`);

  // Step 2: Submit verification request
  console.log('\nSubmitting verification request...');
  const task = await client.verifyWithProgram({
    prompt: userQuery,
    models: ['gpt-4', 'claude-3'],
    taskType: 'factual-qa',
    program: agentProgram,
  });

  console.log(`Task ID: ${task.task_id}`);
  console.log(`Status: ${task.status}`);

  // Step 3: Wait for finalization
  console.log('\nWaiting for finalization...');
  const receipt = await client.waitForFinal(task.task_id, {
    pollIntervalMs: 2000,
    timeoutMs: 120000,
  });

  // Step 4: Validate and display receipt
  console.log('\n=== Verification Receipt ===\n');
  displayReceipt(receipt);

  // Step 5: Verify receipt integrity
  const receiptHash = computeReceiptHash(receipt);
  console.log(`\nReceipt Hash: ${receiptHash.slice(0, 18)}...`);

  const validation = validateReceipt(receipt);
  if (!validation.valid) {
    console.error('Receipt validation failed:', validation.errors);
    throw new Error('Invalid receipt');
  }
  console.log('Receipt validation: PASSED');

  // Step 6: Optional on-chain verification
  if (receipt.chain_context) {
    console.log('\n=== On-Chain Verification ===\n');
    const onChainResult = await client.verifyReceiptOnChain(task.task_id);
    console.log(`Verified: ${onChainResult.verified}`);
    if (onChainResult.chain_data) {
      console.log(`Block: ${onChainResult.chain_data.block_number}`);
      console.log(`Tx: ${onChainResult.chain_data.tx_hash.slice(0, 18)}...`);
    }
  }

  // Step 7: Make decision based on verification
  console.log('\n=== Agent Decision ===\n');

  if (!receipt.verdict) {
    console.log('Decision: ABORT - Verification failed');
    return {
      type: 'answer',
      content: 'I cannot provide a reliable answer to this query.',
      confidence: 0,
    };
  }

  if (!receipt.worthy) {
    console.log('Decision: LOW CONFIDENCE - Score below threshold');
    console.log('Recommendation: Request human review');
    return {
      type: 'recommend',
      content: 'This query requires human review for accurate response.',
      confidence: receipt.score_bps / 10000,
    };
  }

  console.log('Decision: PROCEED - High-quality verification');
  return {
    type: 'answer',
    content: `Verified response to: ${userQuery}`,
    confidence: receipt.score_bps / 10000,
  };
}

/**
 * Display receipt details
 */
function displayReceipt(receipt: VerificationReceipt): void {
  console.log(`Task ID: ${receipt.task_id}`);
  console.log(`Generated: ${new Date(receipt.generated_at * 1000).toISOString()}`);
  console.log(`Score: ${receipt.score_bps / 100}%`);
  console.log(`Verdict: ${receipt.verdict ? 'PASS' : 'FAIL'}`);
  console.log(`Worthy: ${receipt.worthy ? 'YES' : 'NO'}`);

  console.log(`\nInput Hash: ${receipt.input_hash.slice(0, 18)}...`);
  console.log(`Output Hash: ${receipt.output_hash.slice(0, 18)}...`);

  if (receipt.program) {
    console.log(`\nProgram: ${receipt.program.name} v${receipt.program.version}`);
    console.log(`Program ID: ${receipt.program.program_id}`);
    console.log(`Program Fingerprint: ${receipt.program.fingerprint.slice(0, 18)}...`);
  }

  console.log(`\nEvidence Bundle: ${receipt.evidence.bundle_uri}`);
  console.log(`Bundle Hash: ${receipt.evidence.bundle_hash.slice(0, 18)}...`);
  console.log(`Bundle Version: ${receipt.evidence.bundle_version}`);

  if (receipt.metering) {
    console.log('\nMetering:');
    console.log(`  LLM Calls: ${receipt.metering.llm_calls}`);
    console.log(`  Total Tokens: ${receipt.metering.total_tokens}`);
    console.log(`  Execution: ${receipt.metering.execution_ms}ms`);
  }

  console.log(`\nProvenance:`);
  console.log(`  Provider: ${receipt.provenance.llm_provider}`);
  console.log(`  Model: ${receipt.provenance.llm_model}`);
  if (receipt.provenance.verifier_node) {
    console.log(`  Node: ${receipt.provenance.verifier_node}`);
  }
}

/**
 * Demo: Verify a program fingerprint matches
 */
function verifyProgramMatch(receipt: VerificationReceipt): boolean {
  if (!receipt.program) {
    console.log('No program reference in receipt');
    return true; // No program used
  }

  const expectedFingerprint = computeProgramFingerprint(agentProgram);

  if (receipt.program.fingerprint !== expectedFingerprint) {
    console.error('Program fingerprint mismatch!');
    console.error(`Expected: ${expectedFingerprint}`);
    console.error(`Got: ${receipt.program.fingerprint}`);
    return false;
  }

  console.log('Program fingerprint verified: MATCH');
  return true;
}

// Main execution
async function main() {
  const query = process.argv[2] || 'What is the capital of France?';

  try {
    const action = await agentWithVerification(query);

    console.log('\n=== Final Action ===\n');
    console.log(`Type: ${action.type}`);
    console.log(`Content: ${action.content}`);
    console.log(`Confidence: ${(action.confidence * 100).toFixed(1)}%`);
  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  }
}

main();
