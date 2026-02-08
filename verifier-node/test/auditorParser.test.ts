import { parseAuditorArgs } from '../src/cli/auditorParser';

describe('auditorParser', () => {
  it('parses list-disputes', () => {
    const command = parseAuditorArgs(['list-disputes', '--status', 'OPEN']);
    expect(command).toEqual({ kind: 'list-disputes', status: 'OPEN' });
  });

  it('parses run command', () => {
    const command = parseAuditorArgs([
      'run',
      '12',
      '--program',
      'factual-consensus@1.0.0',
      '--bundle',
      'bundle.json',
    ]);
    expect(command).toMatchObject({
      kind: 'run',
      disputeId: 12,
      program: 'factual-consensus@1.0.0',
      bundle: 'bundle.json',
    });
  });

  it('parses submit command', () => {
    const command = parseAuditorArgs([
      'submit',
      '3',
      '--verdict',
      'ACCEPT',
      '--score-bps',
      '9000',
      '--evidence-hash',
      '0xabc',
      '--bundle',
      'bundle.json',
      '--dry-run',
    ]);
    expect(command).toMatchObject({
      kind: 'submit',
      disputeId: 3,
      verdict: 'ACCEPT',
      scoreBps: 9000,
      evidenceHash: '0xabc',
      bundle: 'bundle.json',
      dryRun: true,
    });
  });
});
