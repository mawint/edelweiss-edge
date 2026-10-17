// Plays rounds back to back (staged instantly, no animation) and checks each one was staged to its end and
// the balance moved by exactly what the RGS paid less the bet.
//   node qa/probes/rounds.mjs [--url http://localhost:5200/] [--modes easy_10,pinpoint_13,edge] [--n 4]
import { openPage, parseArgs, sleep } from '../lib/chrome.mjs';

const a = parseArgs({ url: 'http://localhost:5200/', modes: 'easy_10,medium_12,hard_13,pinpoint_13,edge', n: 4 });
const page = await openPage({ width: 1280, height: 800 });
let bad = 0;
try {
  await page.openGame(a.url);
  await page.ev('game.state.instant = true');
  for (const mode of String(a.modes).split(',')) {
    const [difficulty, from] = mode === 'edge' ? ['edge', 0] : mode.split('_');
    await page.ev(`Object.assign(game.state, { difficulty: ${JSON.stringify(difficulty)}, from: ${Number(from)} }); game.syncControls()`);
    for (let r = 0; r < +a.n; r++) {
      const before = await page.ev('game.state.balance');
      const bet = await page.ev('game.state.bet');
      await page.ev('game.climb()');
      const { win, step, inWindow, multiplier, phase } = JSON.parse(await page.ev('JSON.stringify({ ...game.state.plan, phase: game.state.phase })'));
      const after = await page.ev('game.state.balance');
      const ok = phase === 'idle' && Math.abs(after - (before - bet + win * bet)) < 1e-9;
      if (!ok) bad++;
      console.log(ok ? 'OK ' : 'BAD', mode, JSON.stringify({ step, inWindow, multiplier, win }), `balance ${before} -> ${after}`);
      await sleep(100);
    }
  }
  console.log('errors', await page.ev('JSON.stringify(__qaErrors)'));
} finally {
  page.close();
}
process.exit(bad ? 1 : 0);
