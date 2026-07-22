import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProgramRegistry, computeProgramHash } from '../../programs/registry';
import { ProgramContext } from '../../programs/interface';
import { EvidenceBundle } from '../../shared/types';

const fixturesDir = path.join(__dirname, 'fixtures', 'programs');

function buildBundle(): EvidenceBundle {
  return {
    version: '1.0.0',
    task_id: 'task-1',
    bundle_version: '0.2',
    created_at: '2024-01-01T00:00:00Z',
    evaluator: {
      node_id: 'node-test',
      eth_address: '0x' + '11'.repeat(20),
      software: { name: 'verifier-node', ver: '0.1.0', commit: 'abc123' },
    },
    prompt_hash: '0x' + '22'.repeat(32),
    rubric_hash: '0x' + '33'.repeat(32),
    model_runs: [
      {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.1,
        raw_output: 'hello',
        output_hash: '0x' + '44'.repeat(32),
      },
    ],
    claims: [],
    metrics: {
      consensus: { agreement: 0.9, clusters: 1 },
      factuality: { supported_claim_ratio: 0.9 },
      citation_quality: { authority_score: 0.9 },
      bias: { sensitive_variance: 0 },
      stability: { reask_delta: 0.1 },
    },
    final_score_bps: 9000,
    explanation: 'ok',
    signatures: { bundle_sig_eip712: '0x' + '11'.repeat(65) },
    input: { content_type: 'text', content_hash: '0x' + '55'.repeat(32) },
    output: { content_type: 'text', content_hash: '0x' + '66'.repeat(32) },
    provenance: {
      model_runs: [
        {
          provider: 'openai',
          model: 'gpt-4',
          prompt_hash: '0x' + '22'.repeat(32),
          response_hash: '0x' + '44'.repeat(32),
          started_at: 1,
          finished_at: 2,
        },
      ],
    },
    scoring_trace: {
      rubric_hash: '0x' + '33'.repeat(32),
      score_bps: 9000,
      verdict: 'reliable',
      breakdown: {},
      generated_at: 1,
    },
  };
}

function buildContext(programHash: string): ProgramContext {
  return {
    task_id: 'task-1',
    input_hash: '0x' + '22'.repeat(32),
    output_hash: '0x' + '44'.repeat(32),
    bundle_hash: '0x' + '77'.repeat(32),
    bundle_uri: 'ipfs://bundle',
    bundle_version: '0.2',
    chain_id: 421614,
    contract_address: '0x' + '88'.repeat(20),
    llm_provider: 'openai',
    llm_model: 'gpt-4',
    program_hash: programHash,
  };
}

describe('ProgramRegistry', () => {
  it('loads programs from filesystem', () => {
    const registry = new ProgramRegistry({ programsDir: fixturesDir });
    registry.loadPrograms();
    const programs = registry.listPrograms();
    expect(programs.some((program) => program.id === 'fixture-program')).toBe(true);
  });

  it('rejects invalid semver versions', () => {
    const invalidDir = path.join(fixturesDir, 'invalid-version');
    const registry = new ProgramRegistry({ programsDir: invalidDir });
    expect(() => registry.loadPrograms()).toThrow(/Invalid semver/);
  });

  it('produces deterministic program hashes', () => {
    const programDir = path.join(fixturesDir, 'fixture-program');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(programDir, 'manifest.json'), 'utf8')
    );
    const hash1 = computeProgramHash(programDir, manifest);
    const hash2 = computeProgramHash(programDir, manifest);
    expect(hash1).toBe(hash2);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'program-fixture-'));
    fs.cpSync(programDir, tempDir, { recursive: true });
    const tempManifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf8')
    );
    const originalHash = computeProgramHash(tempDir, tempManifest);
    fs.appendFileSync(path.join(tempDir, 'index.js'), '\n// change');
    const updatedHash = computeProgramHash(tempDir, tempManifest);
    expect(updatedHash).not.toBe(originalHash);
  });

  it('fails when evidence requirements are not met', async () => {
    const registry = new ProgramRegistry({ programsDir: fixturesDir });
    registry.loadPrograms();
    const bundle = buildBundle();
    bundle.model_runs = [];

    const record = registry.resolveProgram('fixture-program', '1.2.3');
    const context = buildContext(record.hash);

    await expect(
      registry.runProgram(bundle, context, 'fixture-program', '1.2.3')
    ).rejects.toThrow(/model_runs/);
  });

  it('returns receipts with program hash', async () => {
    const registry = new ProgramRegistry({ programsDir: fixturesDir });
    registry.loadPrograms();
    const record = registry.resolveProgram('fixture-program', '1.2.3');
    const receipt = await registry.runProgram(
      buildBundle(),
      buildContext(record.hash),
      'fixture-program',
      '1.2.3'
    );
    expect(receipt.program?.hash).toBe(record.hash);
  });
});

describe('program epistemic declarations', () => {
  it('rejects a missing provenance declaration', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'program-no-provenance-'));
    fs.cpSync(path.join(fixturesDir, 'fixture-program'), temp, { recursive: true });
    const manifestPath = path.join(temp, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); delete manifest.program_provenance; fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new ProgramRegistry({ programsDir: path.dirname(temp) }).loadPrograms()).toThrow();
  });
});
