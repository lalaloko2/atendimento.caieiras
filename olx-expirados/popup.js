const OLX_EXPIRED_URL = 'https://conta.olx.com.br/anuncios/expirados';

let currentListings = [];
let progressInterval = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function show(id) {
  const states = [
    'state-idle', 'state-loading', 'state-empty', 'state-error',
    'state-results', 'state-renewing', 'state-done',
  ];
  states.forEach(s => document.getElementById(s).classList.toggle('hidden', s !== id));
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

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function queryActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── List view ────────────────────────────────────────────────────────────────

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
        ${item.date ? `<div class="listing-date">${escHtml(item.date)}</div>` : ''}
        ${item.id   ? `<div class="listing-id">ID: ${escHtml(item.id)}</div>` : ''}
      </div>`;
    if (item.url) li.addEventListener('click', () => chrome.tabs.create({ url: item.url }));
    list.appendChild(li);
  });
}

function exportCsv(listings) {
  const header = ['Título', 'Preço', 'Data', 'ID', 'URL'];
  const rows = listings.map(l =>
    [l.title, l.price, l.date, l.id, l.url]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'olx-expirados.csv'; a.click();
  URL.revokeObjectURL(url);
}

async function fetchListings() {
  show('state-loading');
  const tab = await queryActiveTab();

  if (!tab?.url?.includes('conta.olx.com.br/anuncios')) {
    show('state-idle');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id }, files: ['content.js'],
    }).catch(() => {});

    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: 'getExpiredListings' }, res => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    if (!response?.ok) throw new Error(response?.error || 'Sem resposta da página.');

    currentListings = response.listings || [];

    if (currentListings.length === 0) {
      show('state-empty'); setBadge(0);
    } else {
      renderListings(currentListings);
      document.getElementById('count-label').textContent =
        `${currentListings.length} expirado${currentListings.length !== 1 ? 's' : ''}`;
      setBadge(currentListings.length);
      show('state-results');
    }
  } catch (err) {
    document.getElementById('error-msg').textContent = `Erro: ${err.message}`;
    show('state-error');
  }
}

// ── Renewal ──────────────────────────────────────────────────────────────────

function startProgressPolling() {
  stopProgressPolling();
  progressInterval = setInterval(async () => {
    const data = await chrome.storage.local.get(['renewalActive', 'renewalDone', 'renewalFailed']);
    document.getElementById('renew-done').textContent   = data.renewalDone   || 0;
    document.getElementById('renew-failed').textContent = data.renewalFailed  || 0;

    if (!data.renewalActive) {
      stopProgressPolling();
      document.getElementById('done-count').textContent  = data.renewalDone   || 0;
      document.getElementById('done-failed').textContent = data.renewalFailed  || 0;
      show('state-done');
    }
  }, 1000);
}

function stopProgressPolling() {
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

async function startRenewal() {
  await chrome.runtime.sendMessage({ action: 'startRenewal' });
  show('state-renewing');
  startProgressPolling();
}

async function stopRenewal() {
  stopProgressPolling();
  await chrome.runtime.sendMessage({ action: 'stopRenewal' });
  fetchListings();
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Check if renewal is already running
  const data = await chrome.storage.local.get('renewalActive');
  if (data.renewalActive) {
    show('state-renewing');
    startProgressPolling();
    return;
  }

  const tab = await queryActiveTab();
  if (tab?.url?.includes('conta.olx.com.br/anuncios')) {
    fetchListings();
  } else {
    show('state-idle');
  }

  // Buttons
  document.getElementById('btn-go').addEventListener('click', () =>
    chrome.tabs.create({ url: OLX_EXPIRED_URL })
  );
  document.getElementById('btn-expired-tab').addEventListener('click', () =>
    chrome.tabs.create({ url: OLX_EXPIRED_URL })
  );
  document.getElementById('btn-retry').addEventListener('click', fetchListings);
  document.getElementById('btn-export').addEventListener('click', () => {
    if (currentListings.length > 0) exportCsv(currentListings);
  });
  document.getElementById('btn-renew-all').addEventListener('click', startRenewal);
  document.getElementById('btn-stop').addEventListener('click', stopRenewal);
  document.getElementById('btn-restart').addEventListener('click', () => {
    chrome.storage.local.set({ renewalActive: false });
    fetchListings();
  });
});
