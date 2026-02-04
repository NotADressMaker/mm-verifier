(async function () {
  const apiInput = document.getElementById('apiBaseUrl');
  const saveButton = document.getElementById('save');

  const stored = await chrome.storage.sync.get('apiBaseUrl');
  apiInput.value = stored.apiBaseUrl || 'http://localhost:3000';

  saveButton.addEventListener('click', async () => {
    await chrome.storage.sync.set({ apiBaseUrl: apiInput.value });
    alert('Saved');
  });
})();
