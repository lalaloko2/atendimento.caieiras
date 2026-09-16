const EXPIRADOS_URL = 'https://conta.olx.com.br/anuncios/expirados';

// SHIELD / tracking cookie names to rotate out before starting
const SHIELD_COOKIE_PREFIXES = ['datadome', '__cf_bm', '_dd_s', 'shield', '_gcl_', '_ga', '_fbp'];
const OLX_DOMAINS = ['.olx.com.br', 'conta.olx.com.br', 'adquirir.olx.com.br'];

async function clearShieldCookies() {
  let cleared = 0;
  for (const domain of OLX_DOMAINS) {
    const cookies = await chrome.cookies.getAll({ domain });
    for (const c of cookies) {
      const lower = c.name.toLowerCase();
      if (SHIELD_COOKIE_PREFIXES.some(p => lower.startsWith(p))) {
        const url = `https://${domain.startsWith('.') ? 'conta' + domain : domain}`;
        await chrome.cookies.remove({ url, name: c.name }).catch(() => {});
        cleared++;
      }
    }
  }
  if (cleared) console.log(`[shield] cleared ${cleared} tracking cookie(s)`);
}

// Random delay between min and max ms
function randDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

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

  // Wipe SHIELD/tracking cookies before the run starts
  await clearShieldCookies();

  await chrome.storage.local.set({
    renewalActive: true,
    renewalTabId: tab.id,
    renewalDone: 0,
    renewalFailed: 0,
    renewalCycleSince: 0,
  });

  if (tab.url && tab.url.includes('conta.olx.com.br/anuncios/expirados')) {
    const delay = 1500 + Math.random() * 1500;
    setTimeout(() => triggerNextClick(tab.id), delay);
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

const COOKIE_ROTATE_EVERY = 4; // rotate tracking cookies every N renewals

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;

  const data = await chrome.storage.local.get(['renewalActive', 'renewalTabId', 'renewalDone', 'renewalCycleSince']);
  if (!data.renewalActive) return;
  if (tabId !== data.renewalTabId) return;

  const url = tab.url || '';

  if (url.includes('conta.olx.com.br/anuncios/expirados')) {
    // Rotate SHIELD cookies periodically
    const cycle = (data.renewalDone || 0) - (data.renewalCycleSince || 0);
    if (cycle >= COOKIE_ROTATE_EVERY) {
      await clearShieldCookies();
      await chrome.storage.local.set({ renewalCycleSince: data.renewalDone || 0 });
    }

    // Human-range random delay before next click (2-6s)
    const delay = 2000 + Math.random() * 4000;
    setTimeout(() => triggerNextClick(tabId), delay);
  }
  // adquirir.olx.com.br is handled by content_renewal.js
});
