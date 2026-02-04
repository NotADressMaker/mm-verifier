(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TrustLensReceiptParser = factory();
  }
})(this, function () {
  function parseReceiptContext(content) {
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  return {
    parseReceiptContext,
  };
});
