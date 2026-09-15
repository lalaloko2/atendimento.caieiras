const OLX_MY_ADS_URL = 'https://conta.olx.com.br/anuncios/publicados';
const OLX_EXPIRED_URL = 'https://conta.olx.com.br/anuncios/expirados';

let currentListings = [];

function show(id) {
  ['state-idle', 'state-loading', 'state-empty', 'state-error', 'state-results'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function setBadge(n) {
  const badge = document.getElementById('badge');
  if (n > 0) {
    badge.textContent = n;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderListings(listings) {
  const list = document.getElementById('listing-list');
  list.innerHTML = '';

  listings.forEach(item => {
    const li = document.createElement('li');
    li.className = 'listing-item';
    li.title = item.title;

    const thumb = item.image
      ? `<img class="listing-thumb" src="${escHtml(item.image)}" alt="" />`
      : `<div class="listing-thumb-placeholder">📦</div>`;

    li.innerHTML = `
      ${thumb}
      <div class="listing-info">
        <div class="listing-title">${escHtml(item.title)}</div>
        <div class="listing-price">${escHtml(item.price)}</div>
        ${item.date ? `<div class="listing-date">Expirado: ${escHtml(item.date)}</div>` : ''}
        ${item.id ? `<div class="listing-id">ID: ${escHtml(item.id)}</div>` : ''}
      </div>
    `;

    if (item.url) {
      li.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
    }

    list.appendChild(li);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exportCsv(listings) {
  const header = ['Título', 'Preço', 'Data', 'ID', 'URL'];
  const rows = listings.map(l =>
    [l.title, l.price, l.date, l.id, l.url].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'olx-expirados.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function queryActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function fetchListings() {
  show('state-loading');

  const tab = await queryActiveTab();
  if (!tab || !tab.url || !tab.url.includes('olx.com.br/meus-anuncios')) {
    show('state-idle');
    return;
  }

  try {
    // Inject content script just in case it's not yet running
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    }).catch(() => {}); // ignore if already injected

    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: 'getExpiredListings' }, res => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Sem resposta da página.');
    }

    currentListings = response.listings || [];

    if (currentListings.length === 0) {
      show('state-empty');
      setBadge(0);
    } else {
      renderListings(currentListings);
      document.getElementById('count-label').textContent =
        `${currentListings.length} anúncio${currentListings.length !== 1 ? 's' : ''} expirado${currentListings.length !== 1 ? 's' : ''}`;
      setBadge(currentListings.length);
      show('state-results');
    }
  } catch (err) {
    document.getElementById('error-msg').textContent = `Erro: ${err.message}`;
    show('state-error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await queryActiveTab();
  const onOlx = tab?.url?.includes('conta.olx.com.br/anuncios');

  if (onOlx) {
    fetchListings();
  } else {
    show('state-idle');
  }

  document.getElementById('btn-go').addEventListener('click', () => {
    chrome.tabs.create({ url: OLX_EXPIRED_URL });
  });

  document.getElementById('btn-expired-tab').addEventListener('click', () => {
    chrome.tabs.create({ url: OLX_EXPIRED_URL });
  });

  document.getElementById('btn-retry').addEventListener('click', fetchListings);

  document.getElementById('btn-export').addEventListener('click', () => {
    if (currentListings.length > 0) exportCsv(currentListings);
  });
});
