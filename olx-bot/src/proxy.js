// Residential proxy pool — round-robin rotation after N renewals

class ProxyPool {
  constructor(proxies = [], rotateEvery = 5) {
    this.proxies     = proxies;
    this.rotateEvery = rotateEvery;
    this._index      = Math.floor(Math.random() * Math.max(proxies.length, 1));
    this._counter    = 0;
  }

  get current() {
    return this.proxies.length ? this.proxies[this._index] : null;
  }

  // Call after each renewal; returns true if rotated
  tick() {
    if (!this.proxies.length) return false;
    this._counter++;
    if (this._counter >= this.rotateEvery) {
      this._index   = (this._index + 1) % this.proxies.length;
      this._counter = 0;
      console.log(`[proxy] → ${this._masked()}`);
      return true;
    }
    return false;
  }

  // Puppeteer launch args for current proxy
  launchArgs() {
    return this.current ? [`--proxy-server=${this.current}`] : [];
  }

  // Credentials for page.authenticate() — works for HTTP proxies with basic auth
  auth() {
    const m = this.current?.match(/\/\/([^:@]+):([^@]+)@/);
    return m ? { username: m[1], password: m[2] } : null;
  }

  _masked() {
    return this.current?.replace(/:([^:@]+)@/, ':***@') ?? 'none';
  }
}

module.exports = ProxyPool;
