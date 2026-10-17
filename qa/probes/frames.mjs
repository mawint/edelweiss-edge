// Screenshots of one animated round at intervals, to check the staging by eye.
//   node qa/probes/frames.mjs [--url http://localhost:5200/] [--size 1280x720] [--mode medium_11] [--every 2500] [--n 8]
import { openPage, parseArgs, size, sleep } from '../lib/chrome.mjs';

const a = parseArgs({ url: 'http://localhost:5200/', size: '1280x720', mode: 'medium_11', every: 2500, n: 8 });
const [width, height] = size(a.size);
const page = await openPage({ width, height });
try {
  await page.openGame(a.url);
  const [difficulty, from] = a.mode === 'edge' ? ['edge', 0] : a.mode.split('_');
  await page.ev(`Object.assign(game.state, { difficulty: ${JSON.stringify(difficulty)}, from: ${Number(from)} }); game.syncControls()`);
  await page.ev('void game.climb()');
  for (let i = 1; i <= +a.n; i++) {
    await sleep(+a.every);
    await page.screenshot(`qa/results/frame-${i}.png`);
  }
  console.log('book', await page.ev('JSON.stringify(game.state.plan && { step: game.state.plan.step, win: game.state.plan.win })'));
  console.log('errors', await page.ev('JSON.stringify(__qaErrors)'));
} finally {
  page.close();
}
process.exit(0);
