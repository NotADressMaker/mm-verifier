(function () {
  function getMetaReceipt() {
    const meta = document.querySelector('meta[name="mmv-receipt"]');
    if (!meta) {
      return null;
    }
    return meta.getAttribute('content');
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'GET_META_RECEIPT') {
      sendResponse({ content: getMetaReceipt() });
    }
  });
})();
