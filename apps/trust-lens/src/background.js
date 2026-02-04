(function () {
  const receiptByTab = new Map();

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      const header = details.responseHeaders?.find(
        (item) => item.name.toLowerCase() === 'x-mmv-receipt'
      );
      if (header && header.value) {
        receiptByTab.set(details.tabId, header.value);
      }
    },
    { urls: ['<all_urls>'], types: ['main_frame'] },
    ['responseHeaders']
  );

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'GET_HEADER_RECEIPT') {
      const tabId = sender.tab?.id ?? message.tabId;
      const value = tabId ? receiptByTab.get(tabId) : null;
      sendResponse({ value: value || null });
    }
  });
})();
