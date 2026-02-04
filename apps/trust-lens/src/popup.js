(async function () {
  const receiptIdEl = document.getElementById('receiptId');
  const workHashEl = document.getElementById('workHash');
  const summaryEl = document.getElementById('summary');
  const flagsEl = document.getElementById('flags');
  const openReceiptBtn = document.getElementById('openReceipt');
  const openDashboardBtn = document.getElementById('openDashboard');

  function setFlags(flags) {
    flagsEl.innerHTML = '';
    if (flags.length === 0) {
      const flag = document.createElement('span');
      flag.className = 'flag ok';
      flag.textContent = 'NO_FLAGS';
      flagsEl.appendChild(flag);
      return;
    }
    for (const item of flags) {
      const flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = item;
      flagsEl.appendChild(flag);
    }
  }

  const { parseReceiptContext } = window.TrustLensReceiptParser;

  const { apiBaseUrl = 'http://localhost:3000' } = await chrome.storage.sync.get('apiBaseUrl');

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) {
    receiptIdEl.textContent = 'No active tab';
    setFlags(['UNVERIFIED']);
    return;
  }

  const headerReceipt = await chrome.runtime.sendMessage({ type: 'GET_HEADER_RECEIPT', tabId: activeTab?.id });
  let metaReceiptResponse = null;
  try {
    metaReceiptResponse = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_META_RECEIPT' });
  } catch (error) {
    metaReceiptResponse = null;
  }

  const headerContext = parseReceiptContext(headerReceipt?.value);
  const metaContext = parseReceiptContext(metaReceiptResponse?.content);
  const context = headerContext || metaContext;

  if (!context) {
    receiptIdEl.textContent = 'No receipt detected';
    setFlags(['UNVERIFIED']);
    return;
  }

  receiptIdEl.textContent = context.receiptId || context.requestId;
  workHashEl.textContent = context.workHash ? `workHash: ${context.workHash}` : '';

  let receipt = null;
  let history = [];
  let summary = null;

  if (context.receiptId) {
    receipt = await window.TrustLensApiClient.getReceipt(apiBaseUrl, context.receiptId);
  }
  if (context.requestId) {
    history = await window.TrustLensApiClient.getReceiptHistory(apiBaseUrl, context.requestId);
  }
  if (receipt?.validatorId) {
    summary = await window.TrustLensApiClient.getValidatorSummary(apiBaseUrl, receipt.validatorId);
  }

  if (receipt) {
    summaryEl.textContent = `${receipt.verdict} • ${receipt.score} • ${receipt.tag} • ${receipt.timestamp} • validator ${receipt.validatorId}`;
  } else {
    summaryEl.textContent = 'No receipt data found';
  }

  const flags = window.TrustLensRisk.computeRiskFlags({
    receipt,
    history,
    validatorSummary: summary,
  });
  setFlags(flags);

  openReceiptBtn.addEventListener('click', () => {
    if (receipt?.receiptURI) {
      chrome.tabs.create({ url: receipt.receiptURI });
    }
  });

  openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `${apiBaseUrl}/api/validation/requests/${context.requestId}` });
  });
})();
