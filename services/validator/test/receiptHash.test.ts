import { buildReceipt } from '../src/receipt';
import { hashCanonical } from '../../../shared/canonicalJson';
import { MmvValidationRequest, MmvResult } from '../../../shared/validationTypes';

describe('receipt hashing', () => {
  it('computes deterministic receipt hash', () => {
    const request: MmvValidationRequest = {
      requestId: 'req-4',
      createdAt: '2024-01-01T00:00:00.000Z',
      plugin: 'deterministic',
      payload: {
        runner: 'bash',
        command: 'echo 1',
        inputHash: hashCanonical('input'),
      },
      workHash: hashCanonical('work'),
    };

    const result: MmvResult = {
      score0to100: 100,
      verdict: 'PASS',
      tag: 'deterministic-reexec',
      receiptURI: 'http://localhost/receipts/1',
      receiptHash: '0x0',
      detailsHash: hashCanonical('details'),
    };

    const receipt = buildReceipt(request, result, hashCanonical('logs'), hashCanonical('env'));
    const expectedHash = hashCanonical({
      ...receipt,
      receiptHash: undefined,
    });
    expect(receipt.receiptHash).toBe(expectedHash);
  });
});
