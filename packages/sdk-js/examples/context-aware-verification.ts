import { MAMVClient } from '../src';

async function main() {
  const client = new MAMVClient({ baseUrl: process.env.MAMV_API_URL || 'http://localhost:3000', apiKey: process.env.MAMV_API_KEY });
  const request = await client.verifyWithProgram({
    prompt: 'The latest policy makes this treatment safe.',
    models: ['gpt-4'], taskType: 'policy-compliance', programId: 'factual-consensus', programVersion: '1.0.0',
  });
  const receipt = await client.waitForFinal(request.task_id);
  console.log('Interpretation:', receipt.verification_context?.interpretation?.summary);
  console.log('Assumptions:', receipt.verification_context?.interpretation?.assumptions ?? []);
  console.log('Claims:', receipt.claims ?? []);
  console.log('Claim-level evidence:', receipt.evidence_relations ?? []);
  console.log('Verdict:', receipt.verification_status, 'Limitations:', receipt.limitations ?? []);

  const next = await client.reverifyReceipt(receipt.receipt_id!, { mode: 'latest_program_version', reason: 'Review against the latest policy rules.' });
  console.log(await client.compareReceipts(receipt.receipt_id!, next.receipt_id!));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
