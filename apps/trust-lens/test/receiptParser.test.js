const { parseReceiptContext } = require('../src/receiptParser');

describe('receipt parser', () => {
  it('parses valid JSON', () => {
    const payload = JSON.stringify({ requestId: 'req-1', receiptId: 'rec-1' });
    const result = parseReceiptContext(payload);
    expect(result.requestId).toBe('req-1');
  });

  it('returns null for invalid JSON', () => {
    const result = parseReceiptContext('not-json');
    expect(result).toBeNull();
  });
});
