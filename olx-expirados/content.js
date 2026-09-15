(function () {
  const CARD_SELECTORS = [
    '[data-lurker-detail="list_id"]',
    '[data-ds-component="DS-NewAdCard"]',
    '[class*="AdCard"]',
    '[class*="ad-card"]',
    '[class*="OLXsc"]',
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

    const linkEl = card.querySelector('a[href*="olx.com.br"]') || card.querySelector('a[href]');
    const imgEl = card.querySelector('img');

    const dateEl =
      card.querySelector('[class*="date" i]') ||
      card.querySelector('[class*="data" i]') ||
      card.querySelector('time');

    return {
      title: titleEl?.textContent?.trim() || 'Sem título',
      price: priceEl?.textContent?.trim() || '—',
      url: linkEl?.href || '',
      image: imgEl?.src || imgEl?.dataset?.src || '',
      date: dateEl?.textContent?.trim() || '',
      id:
        card.getAttribute('data-list-id') ||
        card.getAttribute('id') ||
        linkEl?.href?.match(/(\d{5,})/)?.[1] || '',
    };
  }

  function isOnExpiredSection() {
    const href = window.location.href;
    if (href.includes('expir') || href.includes('inactive')) return true;

    const activeTab = document.querySelector(
      '[class*="tab"][class*="active"], [class*="Tab"][class*="active"], [aria-selected="true"]'
    );
    if (activeTab) {
      const t = activeTab.textContent.toLowerCase();
      if (t.includes('expir') || t.includes('inactive')) return true;
    }
    return false;
  }

  function getExpiredListings() {
    const cards = findAllCards();

    // If already on expired section, all cards are expired
    if (isOnExpiredSection()) {
      return cards.map(extractData).filter(l => l.title !== 'Sem título' || l.url);
    }

    // Otherwise filter cards that show expired status
    const expired = cards.filter(isExpiredCard);
    return expired.map(extractData);
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getExpiredListings') {
      try {
        const listings = getExpiredListings();
        sendResponse({ ok: true, listings, url: window.location.href });
      } catch (e) {
        sendResponse({ ok: false, error: e.message, listings: [] });
      }
    }
    return true;
  });
})();
