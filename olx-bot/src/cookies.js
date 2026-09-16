// Cookie rotation — wipe SHIELD/tracking cookies, keep auth session intact

const SHIELD_PATTERNS = [
  /^datadome/i,
  /^__cf_bm/i,    // Cloudflare Bot Management
  /^_dd_s/i,      // DataDome session
  /^shield/i,
  /^_gcl_/i,
  /^_ga/i,
  /^_fbp/i,
  /^ab\.storage/i,
];

const AUTH_PATTERNS = [
  /session/i,
  /token/i,
  /auth/i,
  /account/i,
  /olx_/i,
  /logged/i,
];

function isShield(name) {
  return SHIELD_PATTERNS.some(p => p.test(name));
}

function isAuth(name) {
  return AUTH_PATTERNS.some(p => p.test(name));
}

// Snapshot auth cookies before rotation
async function snapshotAuth(page) {
  const all = await page.cookies();
  return all.filter(c => isAuth(c.name) && !isShield(c.name));
}

// Clear tracking/SHIELD cookies via CDP, preserve auth
async function clearShieldCookies(page) {
  const client = await page.createCDPSession();
  const { cookies } = await client.send('Network.getAllCookies');

  const targets = cookies.filter(c => isShield(c.name));
  for (const c of targets) {
    await client.send('Network.deleteCookies', {
      name:   c.name,
      domain: c.domain,
      path:   c.path,
    }).catch(() => {});
  }

  await client.detach();
  if (targets.length) {
    console.log(`[cookies] cleared ${targets.length} tracking cookie(s): ${targets.map(c => c.name).join(', ')}`);
  }
}

// Restore previously snapshotted auth cookies
async function restoreAuth(page, snapshot) {
  if (snapshot.length) {
    await page.setCookie(...snapshot);
    console.log(`[cookies] restored ${snapshot.length} auth cookie(s)`);
  }
}

module.exports = { snapshotAuth, clearShieldCookies, restoreAuth };
