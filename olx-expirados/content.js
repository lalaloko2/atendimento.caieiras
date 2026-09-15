(function () {
  // OLX uses conta.olx.com.br/anuncios/expirados
  // Each listing is a row with a status label and card data

  function isOnExpiredTab() {
    return window.location.pathname.includes('/expirados');
  }

  function findListingRows() {
    // Based on OLX's actual DOM: listing rows inside the anuncios list
    // Each has a status badge ("PUBLICADO", "EXPIRADO", etc.) and card content
    const candidates = [
      // OLX uses section or li elements per listing
      'section[class*="ad"]',
      'li[class*="ad"]',
      '[data-testid*="ad-card"]',
      '[data-testid*="listing"]',
      // Fallback: any container that has a status label + price
      'div[class*="AdCard"]',
      'div[class*="adCard"]',
      'article',
    ];

    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    }

    // Last resort: find divs that contain status text + action buttons
    return findByContent();
  }

  function findByContent() {
    // Walk top-level containers looking for listing-shaped blocks
    const results = [];
    const all = document.querySelectorAll('div, section, li, article');
    for (const el of all) {
      // A listing block: has a status label AND price AND an edit/delete action
      const text = el.textContent || '';
      const hasStatus = /PUBLICADO|EXPIRADO|INATIVO|VENDIDO/i.test(text);
      const hasPrice = /R\$\s*[\d.,]+/.test(text);
      const hasAction = el.querySelector('a, button') !== null;
      // Must be a "leaf" container not nested inside another match
      if (hasStatus && hasPrice && hasAction && el.children.length < 20) {
        results.push(el);
      }
    }
    // Deduplicate: keep only elements not inside another result
    return results.filter(el =>
      !results.some(other => other !== el && other.contains(el))
    );
  }

  function isExpiredRow(el) {
    const text = el.textContent || '';
    return /EXPIRADO/i.test(text) ||
      el.querySelector('[class*="expired" i]') !== null ||
      el.querySelector('[class*="expirado" i]') !== null;
  }

  function extractData(el) {
    // Title: first meaningful heading or strong text
    const titleEl =
      el.querySelector('h2') ||
      el.querySelector('h3') ||
      el.querySelector('[class*="title" i]') ||
      el.querySelector('strong');

    // Price: R$ pattern
    const priceEl =
      el.querySelector('[class*="price" i]') ||
      el.querySelector('[class*="preco" i]') ||
      (() => {
        const all = el.querySelectorAll('*');
        for (const e of all) {
          if (/R\$\s*[\d.,]+/.test(e.textContent) && e.children.length === 0) return e;
        }
        return null;
      })();

    // Link — prefer link to the ad detail page
    const linkEl =
      el.querySelector('a[href*="/anuncios/"]') ||
      el.querySelector('a[href*="olx.com.br"]') ||
      el.querySelector('a[href]');

    const imgEl = el.querySelector('img');

    // Date: look for date-like text
    const dateEl =
      el.querySelector('time') ||
      el.querySelector('[class*="date" i]') ||
      el.querySelector('[class*="data" i]') ||
      (() => {
        const all = el.querySelectorAll('*');
        for (const e of all) {
          if (/\d{2}\/\d{2}\/\d{2,4}|\d{2}\/\d{2}\s+às/.test(e.textContent) && e.children.length === 0) return e;
        }
        return null;
      })();

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

  function getExpiredListings() {
    const rows = findListingRows();

    if (isOnExpiredTab()) {
      // All rows on this tab are expired
      return rows.map(extractData).filter(l => l.title !== '—' || l.url);
    }

    // Mixed tab: filter only expired ones
    return rows.filter(isExpiredRow).map(extractData);
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
