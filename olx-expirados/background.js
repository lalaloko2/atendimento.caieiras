const EXPIRADOS_URL = 'https://conta.olx.com.br/anuncios/expirados';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startRenewal') {
    handleStartRenewal().then(r => sendResponse(r));
    return true;
  }
  if (msg.action === 'stopRenewal') {
    chrome.storage.local.set({ renewalActive: false });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'renewalComplete') {
    chrome.storage.local.set({ renewalActive: false });
    return true;
  }
  if (msg.action === 'getProgress') {
    chrome.storage.local.get(
      ['renewalActive', 'renewalDone', 'renewalFailed'],
      data => sendResponse(data)
    );
    return true;
  }
});

async function handleStartRenewal() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { ok: false };

  await chrome.storage.local.set({
    renewalActive: true,
    renewalTabId: tab.id,
    renewalDone: 0,
    renewalFailed: 0,
  });

  if (tab.url && tab.url.includes('conta.olx.com.br/anuncios/expirados')) {
    setTimeout(() => triggerNextClick(tab.id), 1500);
  } else {
    chrome.tabs.update(tab.id, { url: EXPIRADOS_URL });
  }

  return { ok: true };
}

function triggerNextClick(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'clickNextRenovar' }, () => {
    // ignore errors if content script not ready
    if (chrome.runtime.lastError) {}
  });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;

  const data = await chrome.storage.local.get(['renewalActive', 'renewalTabId']);
  if (!data.renewalActive) return;
  if (tabId !== data.renewalTabId) return;

  const url = tab.url || '';

  if (url.includes('conta.olx.com.br/anuncios/expirados')) {
    // Back on expired page — trigger next click after page settles
    setTimeout(() => triggerNextClick(tabId), 2500);
  }
  // adquirir.olx.com.br is handled by content_renewal.js
});
