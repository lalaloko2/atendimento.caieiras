// OLX renewal bot — puppeteer-extra-plugin-stealth + residential proxies
// + human-like timing + SHIELD cookie rotation
//
// Usage: node src/bot.js
// Config: ../config.json  (fill proxies[], adjust thresholds)

'use strict';

const puppeteer   = require('puppeteer-extra');
const Stealth     = require('puppeteer-extra-plugin-stealth');
const ProxyPool   = require('./proxy');
const { sleep, humanDelay, humanScroll, humanMouseTo } = require('./timing');
const { snapshotAuth, clearShieldCookies, restoreAuth } = require('./cookies');
const config      = require('../config.json');

puppeteer.use(Stealth());

const EXPIRADOS_URL = 'https://conta.olx.com.br/anuncios/expirados';

// Randomised viewport so every session looks different
const VIEWPORT = {
  width:  1280 + Math.floor(Math.random() * 200),
  height:  900 + Math.floor(Math.random() * 100),
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

// ── Browser bootstrap ────────────────────────────────────────────────────────

async function launchBrowser(proxy) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ...proxy.launchArgs(),
  ];

  return puppeteer.launch({
    headless: config.headless ?? false,
    args,
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: VIEWPORT,
  });
}

async function newPage(browser, proxy) {
  const page = await browser.newPage();

  // Proxy basic auth
  const auth = proxy.auth();
  if (auth) await page.authenticate(auth);

  // Randomise user agent
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  await page.setUserAgent(ua);

  // Extra masks on top of stealth plugin
  await page.evaluateOnNewDocument(() => {
    // Harden webdriver removal (belt + suspenders)
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });

    // Realistic plugin list
    if (!navigator.plugins.length) {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
        ],
      });
    }

    // Realistic languages
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
  });

  return page;
}

// ── OLX page actions ─────────────────────────────────────────────────────────

async function waitForListings(page) {
  await page.waitForSelector(
    '[class*="AdCard"], article, [data-lurker-detail], [data-ds-component]',
    { timeout: 90000 }
  ).catch(() => {});
}

// Returns true if a Renovar button was found and clicked
async function clickNextRenovar(page) {
  const found = await page.evaluate(() => {
    const all = [...document.querySelectorAll('a, button')];
    const btn = all.find(el => {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      return /^renovar$/i.test(text) || /^⚡\s*renovar$/i.test(text);
    });
    if (!btn) return false;
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  });

  if (!found) return false;

  // Give scroll animation time, move mouse naturally, then click
  await sleep(600 + Math.random() * 400);

  const btn = await page.evaluateHandle(() => {
    const all = [...document.querySelectorAll('a, button')];
    return all.find(el => /^renovar$/i.test(el.textContent.replace(/\s+/g, ' ').trim())) || null;
  });
  const el = btn.asElement();
  if (el) {
    await humanMouseTo(page, el);
    await sleep(300 + Math.random() * 400);
    await el.click();
  }

  return true;
}

async function handleRenewalPage(page) {
  // Wait for adquirir page to render
  await humanDelay(1200, 2800);

  // Pick "Renovar sem destacar" (free)
  const picked = await page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll('label'),
      ...document.querySelectorAll('[role="radio"]'),
      ...document.querySelectorAll('[class*="option"]'),
      ...document.querySelectorAll('[class*="card"]'),
    ];
    for (const el of candidates) {
      if (el.textContent.includes('Renovar sem destacar') || el.textContent.includes('R$ 0,00')) {
        const radio = el.querySelector('input[type="radio"]');
        const target = radio || el;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
    }
    const fallback = document.querySelector('input[type="radio"]');
    if (fallback) { fallback.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
    return false;
  });

  if (picked) {
    await sleep(400 + Math.random() * 400);
    const optEl = await page.evaluateHandle(() => {
      for (const el of [...document.querySelectorAll('label,[role="radio"],[class*="option"],[class*="card"]')]) {
        if (el.textContent.includes('Renovar sem destacar') || el.textContent.includes('R$ 0,00')) {
          return el.querySelector('input[type="radio"]') || el;
        }
      }
      return document.querySelector('input[type="radio"]') || null;
    });
    const optElement = optEl.asElement();
    if (optElement) {
      await humanMouseTo(page, optElement);
      await sleep(200 + Math.random() * 300);
      await optElement.click();
    }
    await humanDelay(600, 1200);
  }

  // Click "Renovar agora"
  const confirmed = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      /renovar agora/i.test(b.textContent.trim())
    );
    if (btn) { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
    return false;
  });

  if (confirmed) {
    await sleep(400 + Math.random() * 600);
    const confirmEl = await page.evaluateHandle(() =>
      [...document.querySelectorAll('button')].find(b =>
        /renovar agora/i.test(b.textContent.trim())
      ) || null
    );
    const confirmElement = confirmEl.asElement();
    if (confirmElement) {
      await humanMouseTo(page, confirmElement);
      await sleep(300 + Math.random() * 400);
      await confirmElement.click();
      return true;
    }
  }

  return false;
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function run() {
  const proxy       = new ProxyPool(config.proxies ?? [], config.proxyRotateEvery ?? 5);
  const cookieEvery = config.cookieRotateEvery ?? 3;
  const maxRenewals = config.maxRenewals ?? 200;
  const delayMin    = config.delayMin    ?? 2000;
  const delayMax    = config.delayMax    ?? 8000;
  const longChance  = config.longPauseChance ?? 0.05;

  console.log('[bot] x10n OLX stealth renewal bot');
  console.log(`[bot] proxy pool: ${proxy.proxies.length} configured`);
  console.log(`[bot] delays: ${delayMin}–${delayMax}ms, long pause chance: ${longChance * 100}%`);
  console.log(`[bot] cookie rotation every ${cookieEvery} renewals`);

  const browser = await launchBrowser(proxy);
  const page    = await newPage(browser, proxy);

  console.log('[bot] navigating to OLX — log in if prompted');
  await page.goto(EXPIRADOS_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await waitForListings(page);
  console.log('[bot] listings loaded — starting renewal loop');

  let renewed   = 0;
  let failed    = 0;
  let cookieCtr = 0;

  for (let i = 0; i < maxRenewals; i++) {
    // ── Cookie rotation ──────────────────────────────────────────────────────
    cookieCtr++;
    if (cookieCtr >= cookieEvery) {
      const snap = await snapshotAuth(page);
      await clearShieldCookies(page);
      await restoreAuth(page, snap);
      cookieCtr = 0;
      await humanDelay(2000, 4000);
    }

    // ── Proxy rotation ───────────────────────────────────────────────────────
    if (proxy.tick()) {
      // Proxy changed — auth is set per-request via page.authenticate so just log
    }

    // ── Human idle scroll before clicking ───────────────────────────────────
    await humanScroll(page, 80 + Math.random() * 300);
    await humanDelay(800, 2000);

    // ── Find and click next Renovar ──────────────────────────────────────────
    const clicked = await clickNextRenovar(page).catch(err => {
      console.error(`[bot] click error: ${err.message}`);
      return false;
    });

    if (!clicked) {
      // Check for load-more button before giving up
      const loadedMore = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button, a')].find(el =>
          /carregar mais|ver mais|próxima|next/i.test(el.textContent)
        );
        if (btn) { btn.click(); return true; }
        return false;
      });

      if (loadedMore) {
        console.log('[bot] loading more listings...');
        await humanDelay(2000, 4000);
        continue;
      }

      console.log('[bot] no more Renovar buttons — done');
      break;
    }

    // ── Wait for navigation to adquirir.olx.com.br ───────────────────────────
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});

    const ok = await handleRenewalPage(page).catch(err => {
      console.error(`[bot] renewal page error: ${err.message}`);
      return false;
    });

    if (ok) {
      renewed++;
      console.log(`[bot] ✓ renewed #${renewed}`);
    } else {
      failed++;
      console.log(`[bot] ✗ failed #${failed}`);
    }

    // ── Navigate back, human delay ───────────────────────────────────────────
    await humanDelay(delayMin, delayMax, longChance);
    await page.goto(EXPIRADOS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await waitForListings(page);
  }

  console.log(`\n[bot] finished — renewed: ${renewed}, failed: ${failed}`);
  await browser.close();
}

run().catch(err => {
  console.error('[bot] fatal:', err.message);
  process.exit(1);
});
