// Screenshot of the game at a screen size (a phone by default), optionally after a round.
//   node qa/probes/screenshot.mjs [--url http://localhost:5200/] [--size 390x844] [--out qa/results/screenshot.png] [--playing]
import { openPage, parseArgs, size } from '../lib/chrome.mjs';

const a = parseArgs({ url: 'http://localhost:5200/', size: '390x844', out: 'qa/results/screenshot.png' });
const [width, height] = size(a.size);
const page = await openPage({ width, height, dpr: 2, mobile: true, touch: true });
try {
  await page.openGame(a.url);
  if (a.playing) await page.ev('game.climb()');
  const overflow = await page.ev('document.documentElement.scrollWidth > innerWidth');
  console.log('horizontal overflow:', overflow);
  await page.screenshot(a.out);
  console.log('saved', a.out);
} finally {
  page.close();
}
process.exit(0);
