import fs from 'fs';
import path from 'path';
import { Wallet } from 'ethers';
import { createEvidenceBundle } from '../src/evidence/evidenceBundler';
import { EvidenceBundle } from '../../shared/types';

const fixturePath = path.join(__dirname, 'fixtures', 'evidence-bundle-v0.1.json');

describe('Evidence bundler v0.1', () => {
  it('emits a v0.1 EvidenceBundle with required fields', async () => {
    const wallet = Wallet.createRandom();
    const marketplaceAddress = '0x0000000000000000000000000000000000000002';

    const responses = [
      {
        response: 'Paris is the capital of France.',
        model: 'gpt-4',
        provider: 'openai',
        timestamp: Date.now(),
        metadata: {
          duration: 1234,
          tokensUsed: 150,
        },
      },
    ];

    const scoringResult = {
      score: 95,
      verdict: 'reliable' as const,
      confidence: 0.96,
      breakdown: {
        consistency: 92,
        agreement: 94,
        citationQuality: 100,
        factualAccuracy: 94,
      },
      reasoning: 'Verified across 1 model.',
    };

    const bundle = await createEvidenceBundle({
      taskId: '0x' + '11'.repeat(32),
      nodeId: 'node:test',
      ethAddress: wallet.address,
      promptHash: '0x' + '22'.repeat(32),
      responses,
      scoringResult,
      wallet,
      marketplaceAddress,
    });

    expect(bundle.task_id).toBeDefined();
    expect(bundle.bundle_version).toBe('0.1');
    expect(bundle.created_at).toBeDefined();
    expect(bundle.model_runs.length).toBeGreaterThan(0);
    expect(bundle.claims.length).toBeGreaterThan(0);
    expect(bundle.metrics).toBeDefined();
    expect(bundle.signatures.bundle_sig_eip712).toMatch(/^0x/);

    expect((bundle as any).jobId).toBeUndefined();
    expect((bundle as any).modelResponses).toBeUndefined();
    expect((bundle as any).analysis).toBeUndefined();
  });

  it('fixture represents a canonical v0.1 bundle shape', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as EvidenceBundle;

    expect(fixture.task_id).toMatch(/^0x/);
    expect(fixture.bundle_version).toBe('0.1');
    expect(fixture.created_at).toBeDefined();
    expect(fixture.evaluator?.eth_address).toMatch(/^0x/);
    expect(Array.isArray(fixture.model_runs)).toBe(true);
    expect(Array.isArray(fixture.claims)).toBe(true);
    expect(fixture.metrics).toBeDefined();
    expect(fixture.final_score_bps).toBeGreaterThan(0);
    expect(fixture.signatures?.bundle_sig_eip712).toMatch(/^0x/);
  });
});
