async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function getReceipt(apiBaseUrl, receiptId) {
  const data = await fetchJson(`${apiBaseUrl}/api/validation/receipts/${receiptId}`);
  return data.receipt;
}

async function getReceiptHistory(apiBaseUrl, requestId) {
  const data = await fetchJson(`${apiBaseUrl}/api/validation/receipts/${requestId}/history`);
  return data.history;
}

async function getValidatorSummary(apiBaseUrl, validatorId) {
  const data = await fetchJson(`${apiBaseUrl}/api/validation/validators/${validatorId}/summary`);
  return data.summary;
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    getReceipt,
    getReceiptHistory,
    getValidatorSummary,
  };
} else {
  window.TrustLensApiClient = {
    getReceipt,
    getReceiptHistory,
    getValidatorSummary,
  };
}
