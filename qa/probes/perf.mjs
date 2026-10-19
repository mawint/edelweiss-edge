// Frame timing over one animated round on a throttled phone: where the render time goes, and how often a frame
// misses its slot. A stand-in for a low-end device; compare runs before and after a change, not across machines.
// The round is the same every run (the busiest fixture book of the mode, with seeded randomness), so runs compare.
//   node qa/probes/perf.mjs [--url http://localhost:5200/] [--size 390x844] [--dpr 3] [--cpu 4] [--mode medium_11] [--ms 14000] [--idle]
// --idle measures the overview between rounds instead (the screen a player looks at most).
import { openPage, parseArgs, size, sleep } from '../lib/chrome.mjs';

const a = parseArgs({ url: 'http://localhost:5200/', size: '390x844', dpr: 3, cpu: 4, mode: 'medium_11', ms: 14000, idle: false });
const [width, height] = size(a.size);
const page = await openPage({ width, height, dpr: +a.dpr, mobile: true, touch: true });
try {
  await page.openGame(a.url);
  await page.throttleCpu(+a.cpu);
  // Time every draw* method and the whole render, and record the gaps between frames
  await page.ev(`(() => {
    const s = game.scene, proto = Object.getPrototypeOf(s), t = (window.__perf = { draw: {}, frames: [], render: [] });
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!/^draw|^render$/.test(k) || typeof proto[k] !== 'function') continue;
      const f = proto[k];
      s[k] = function (...args) { const a = performance.now(); const r = f.apply(this, args); const d = performance.now() - a; if (k === 'render') t.render.push(d); else t.draw[k] = (t.draw[k] || 0) + d; return r; };
    }
    // Canvas calls per frame: what the GPU has to raster, which JS timings don't show
    t.ops = {};
    const P = CanvasRenderingContext2D.prototype;
    for (const k of ['fill', 'stroke', 'fillRect', 'fillText', 'strokeText', 'clip', 'drawImage']) {
      const f = P[k];
      P[k] = function (...args) { t.ops[k] = (t.ops[k] || 0) + 1; return f.apply(this, args); };
    }
    let last = performance.now();
    const tick = (now) => { t.frames.push(now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  const [difficulty, from] = a.mode === 'edge' ? ['edge', 0] : a.mode.split('_');
  await page.ev(`Object.assign(game.state, { difficulty: ${JSON.stringify(difficulty)}, from: ${Number(from)} }); game.syncControls()`);
  await sleep(3000);
  await page.ev(`(() => {
    let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    __perf.frames = []; __perf.render = []; __perf.draw = {}; __perf.ops = {};
  })()`);
  if (!a.idle) {
    await page.ev(`(async () => {
      const [{ loadFixtureBooks }, { stageRound }] = await Promise.all([import('/src/book.ts'), import('/src/director.ts')]);
      const books = (await loadFixtureBooks()).filter((b) => b.mode === ${JSON.stringify(a.mode)});
      const book = books.reduce((x, y) => (y.events.length > x.events.length ? y : x));
      void stageRound(book, game.scene, { format: (v) => v.toFixed(2), bet: 1, social: false });
    })()`);
  }
  await sleep(+a.ms);
  const r = await page.ev(`(() => {
    const { frames, render, draw, ops } = __perf, n = render.length, sum = (xs) => xs.reduce((a, b) => a + b, 0);
    const sorted = [...render].sort((a, b) => a - b), pct = (p) => sorted[Math.min(n - 1, Math.floor(n * p))];
    return {
      dprCap: game.scene.maxDpr, frames: frames.length, fps: +(1000 * frames.length / sum(frames)).toFixed(1),
      long: frames.filter((f) => f > 25).length, worst: Math.round(Math.max(...frames)),
      renderMs: { mean: +(sum(render) / n).toFixed(2), p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2) },
      opsPerFrame: Object.fromEntries(Object.entries(ops).map(([k, v]) => [k, Math.round(v / n)])),
      perFrame: Object.fromEntries(Object.entries(draw).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / n).toFixed(2)])),
    };
  })()`);
  console.log(JSON.stringify(r, null, 1));
  console.log('errors', await page.ev('JSON.stringify(__qaErrors)'));
} finally {
  page.close();
}
process.exit(0);
