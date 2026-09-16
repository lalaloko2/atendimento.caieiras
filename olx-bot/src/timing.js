// Human-like timing — Box-Muller Gaussian + occasional long pause

function gaussianRandom(mean, std) {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function humanDelay(min = 2000, max = 8000, longPauseChance = 0.05) {
  // 5% chance of a long distraction pause (10-30s) — mimics tabbing away, reading
  if (Math.random() < longPauseChance) {
    const pause = 10000 + Math.random() * 20000;
    console.log(`[timing] long pause ${(pause / 1000).toFixed(1)}s`);
    await sleep(pause);
    return;
  }
  const mean = (min + max) / 2;
  const std = (max - min) / 5;
  const ms = Math.max(min, Math.min(max, gaussianRandom(mean, std)));
  await sleep(ms);
}

// Smooth human scroll — incremental with variable speed
async function humanScroll(page, targetDist = null) {
  const dist = targetDist ?? (150 + Math.random() * 450);
  await page.evaluate(async (d) => {
    await new Promise(resolve => {
      let scrolled = 0;
      function step() {
        const chunk = 15 + Math.random() * 35;
        window.scrollBy(0, chunk);
        scrolled += chunk;
        if (scrolled < d) {
          setTimeout(step, 25 + Math.random() * 60);
        } else {
          resolve();
        }
      }
      setTimeout(step, 50 + Math.random() * 80);
    });
  }, dist);
}

// Cubic bezier mouse path from a random starting point to the target element
async function humanMouseTo(page, element) {
  const box = await element.boundingBox();
  if (!box) return;

  const tx = box.x + box.width  * (0.3 + Math.random() * 0.4);
  const ty = box.y + box.height * (0.3 + Math.random() * 0.4);

  const sx = 80 + Math.random() * 1100;
  const sy = 80 + Math.random() * 700;

  // Two control points for natural curve
  const c1x = sx + (tx - sx) * 0.25 + (Math.random() - 0.5) * 180;
  const c1y = sy + (ty - sy) * 0.25 + (Math.random() - 0.5) * 180;
  const c2x = sx + (tx - sx) * 0.75 + (Math.random() - 0.5) * 180;
  const c2y = sy + (ty - sy) * 0.75 + (Math.random() - 0.5) * 180;

  const steps = 20 + Math.floor(Math.random() * 20);
  for (let i = 0; i <= steps; i++) {
    const t  = i / steps;
    const mt = 1 - t;
    const x  = mt**3*sx + 3*mt**2*t*c1x + 3*mt*t**2*c2x + t**3*tx;
    const y  = mt**3*sy + 3*mt**2*t*c1y + 3*mt*t**2*c2y + t**3*ty;
    await page.mouse.move(x, y);
    await sleep(7 + Math.random() * 14);
  }
}

module.exports = { sleep, humanDelay, humanScroll, humanMouseTo };
