// Runs on conta.olx.com.br/anuncios/expirados
(function () {
  const CARD_SELECTORS = [
    '[data-lurker-detail="list_id"]',
    '[data-ds-component="DS-NewAdCard"]',
    '[class*="AdCard"]',
    '[class*="ad-card"]',
    'article',
  ];

  function findAllCards() {
    for (const sel of CARD_SELECTORS) {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 0) return Array.from(cards);
    }
    return [];
  }

  function isExpiredCard(card) {
    const text = card.textContent || '';
    const lower = text.toLowerCase();
    if (lower.includes('expirado') || lower.includes('expired')) return true;
    if (card.querySelector('[class*="expired" i]')) return true;
    return false;
  }

  function extractData(card) {
    const titleEl =
      card.querySelector('h2') ||
      card.querySelector('h3') ||
      card.querySelector('[class*="title" i]') ||
      card.querySelector('[data-testid*="title"]');

    const priceEl =
      card.querySelector('[class*="price" i]') ||
      card.querySelector('[data-testid*="price"]');

    const linkEl =
      card.querySelector('a[href*="olx.com.br"]') ||
      card.querySelector('a[href]');

    const imgEl = card.querySelector('img');

    const dateEl =
      card.querySelector('[class*="date" i]') ||
      card.querySelector('[class*="data" i]') ||
      card.querySelector('time');

    const url = linkEl?.href || '';
    const idMatch = url.match(/-(\d{6,})/) || url.match(/\/(\d{6,})/);

    return {
      title: titleEl?.textContent?.trim() || '—',
      price: priceEl?.textContent?.trim() || '—',
      url,
      image: imgEl?.src || imgEl?.dataset?.src || '',
      date: dateEl?.textContent?.trim() || '',
      id: idMatch?.[1] || '',
    };
  }

  function isOnExpiredTab() {
    return window.location.pathname.includes('/expirados');
  }

  function isOnExpiredSection() {
    if (isOnExpiredTab()) return true;
    const activeTab = document.querySelector(
      '[class*="tab"][class*="active"], [class*="Tab"][class*="active"], [aria-selected="true"]'
    );
    if (activeTab) {
      const t = activeTab.textContent.toLowerCase();
      if (t.includes('expir')) return true;
    }
    return false;
  }

  function getExpiredListings() {
    const cards = findAllCards();
    if (isOnExpiredSection()) {
      return cards.map(extractData).filter(l => l.title !== '—' || l.url);
    }
    return cards.filter(isExpiredCard).map(extractData);
  }

  // ── Renewal automation ──────────────────────────────────────────────────────

  function findFirstRenovarButton() {
    // Look for button/link with text "Renovar" (not "Renovar agora")
    const all = [...document.querySelectorAll('a, button')];
    return all.find(el => {
      const text = el.textContent.replace(/[\s\n\r]+/g, ' ').trim();
      return /^renovar$/i.test(text) || /^⚡\s*renovar$/i.test(text) || text === 'Renovar';
    });
  }

  function tryLoadMore() {
    // Click "Carregar mais" or pagination next if present
    const loadMore = [...document.querySelectorAll('button, a')].find(el =>
      /carregar mais|ver mais|próxima|next/i.test(el.textContent)
    );
    if (loadMore) {
      loadMore.click();
      return true;
    }
    return false;
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getExpiredListings') {
      try {
        sendResponse({ ok: true, listings: getExpiredListings(), url: window.location.href });
      } catch (e) {
        sendResponse({ ok: false, error: e.message, listings: [] });
      }
    }

    if (request.action === 'clickNextRenovar') {
      const btn = findFirstRenovarButton();
      if (btn) {
        btn.click();
        sendResponse({ found: true });
      } else {
        // Try to load more items first
        if (tryLoadMore()) {
          sendResponse({ found: false, loadingMore: true });
        } else {
          chrome.runtime.sendMessage({ action: 'renewalComplete' });
          sendResponse({ found: false });
        }
      }
    }

    return true;
  });
})();
