const { getReceipt, getReceiptHistory, getValidatorSummary } = require('../src/apiClient');

describe('api client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('fetches receipt', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ receipt: { receiptId: 'r1' } }),
    });

    const receipt = await getReceipt('http://localhost:3000', 'r1');
    expect(receipt.receiptId).toBe('r1');
  });

  it('fetches receipt history', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: [{ receiptId: 'r2' }] }),
    });

    const history = await getReceiptHistory('http://localhost:3000', 'req1');
    expect(history).toHaveLength(1);
  });

  it('fetches validator summary', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ summary: { validatorId: 'v1' } }),
    });

    const summary = await getValidatorSummary('http://localhost:3000', 'v1');
    expect(summary.validatorId).toBe('v1');
  });
});
