// Runs on adquirir.olx.com.br — auto-handles the renewal form
const EXPIRADOS_URL = 'https://conta.olx.com.br/anuncios/expirados';

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function findFreeOptionElement() {
  // Walk all clickable elements looking for the free option card
  const candidates = [
    ...document.querySelectorAll('label'),
    ...document.querySelectorAll('[role="radio"]'),
    ...document.querySelectorAll('[class*="option"]'),
    ...document.querySelectorAll('[class*="card"]'),
    ...document.querySelectorAll('[class*="plan"]'),
  ];

  for (const el of candidates) {
    const text = el.textContent || '';
    if (text.includes('Renovar sem destacar') || text.includes('R$ 0,00')) {
      const radio = el.querySelector('input[type="radio"]');
      return radio || el;
    }
  }

  // Text-node walk fallback
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/renovar sem destacar/i.test(node.textContent)) {
      let parent = node.parentElement;
      for (let i = 0; i < 8; i++) {
        if (!parent) break;
        const radio = parent.querySelector('input[type="radio"]');
        if (radio) return radio;
        if (parent.getAttribute('role') === 'radio') return parent;
        parent = parent.parentElement;
      }
    }
  }

  // Last resort: first radio on page (free option is first)
  return document.querySelector('input[type="radio"]');
}

function findConfirmButton() {
  return [...document.querySelectorAll('button')].find(b =>
    /renovar agora/i.test(b.textContent.trim())
  );
}

async function autoRenew() {
  const { renewalActive } = await chrome.storage.local.get('renewalActive');
  if (!renewalActive) return;

  // Wait for page to render fully
  await delay(1500);

  // Select "Renovar sem destacar" (grátis)
  const freeOpt = findFreeOptionElement();
  if (freeOpt) {
    freeOpt.click();
    await delay(700);
  }

  // Click "Renovar agora"
  const confirmBtn = findConfirmButton();
  if (confirmBtn) {
    confirmBtn.click();
    const { renewalDone = 0 } = await chrome.storage.local.get('renewalDone');
    await chrome.storage.local.set({ renewalDone: renewalDone + 1 });
    await delay(3000);
  } else {
    const { renewalFailed = 0 } = await chrome.storage.local.get('renewalFailed');
    await chrome.storage.local.set({ renewalFailed: renewalFailed + 1 });
    await delay(1000);
  }

  // Navigate back to expirados — background.js will trigger next click
  window.location.href = EXPIRADOS_URL;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoRenew);
} else {
  autoRenew();
}
