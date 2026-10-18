// The rules screen, built from the exported numbers so it always matches the math (review items [25], [27],
// [235], [185]). Social-casino markets (Stake.US) can't say bet, pay, cash and so on: every phrase that
// needs one goes through w(normal, social), and src/wording.test.ts renders the social version to check it.
import { DIFFICULTIES, FIXTURES, startsFor, modeFor, type Difficulty } from './book';

const NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', pinpoint: 'Pinpoint' };

/** The lowest and highest pay a difficulty offers, from the bottom of the ridge to the top. */
export function payRange(d: Difficulty): [number, number] {
  const pays = startsFor(d).map((from) => FIXTURES.modes[modeFor(d, from)!].pay);
  return [Math.min(...pays), Math.max(...pays)];
}
export const widthOf = (d: Difficulty) => {
  const [a, b] = FIXTURES.modes[modeFor(d, startsFor(d)[0])!].window as [number, number];
  return b - a + 1;
};
const x = (v: number) => `${v.toFixed(1)}×`;
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export function rulesHtml(social: boolean): string {
  const w = (normal: string, socialText: string) => (social ? socialText : normal);
  const modes = Object.values(FIXTURES.modes);
  const rtps = [...new Set(modes.map((m) => m.rtp))];
  const maxWins = [...new Set(modes.map((m) => m.maxWin))];
  const rtpLine = rtps.length === 1 ? `${pct(rtps[0])} in every mode` : `${pct(Math.min(...rtps))} to ${pct(Math.max(...rtps))}, by mode`;
  const maxWin = maxWins.length === 1 ? `${maxWins[0].toLocaleString('en-US')}×` : `up to ${Math.max(...maxWins).toLocaleString('en-US')}×`;
  const edge = FIXTURES.modes.edge;
  const r = FIXTURES.rules;
  const top = r.baseMetres + r.top * r.metresPerStep;
  const rows = DIFFICULTIES.map((d) => {
    const [lo, hi] = payRange(d);
    const width = widthOf(d);
    return `<tr><td><b>${NAMES[d]}</b></td><td>${width} step${width > 1 ? 's' : ''}</td><td>${x(lo)} – ${x(hi)}</td></tr>`;
  }).join('');

  return `
<h3>The game</h3>
<p>Ueli the yodeler climbs a ridge of ${r.top} steps, from base camp at ${r.baseMetres.toLocaleString('de-CH')} m to the top station at ${top.toLocaleString('de-CH')} m. Past step ${r.top} he goes over the edge. ${w('Bet on where he stops.', 'Pick where he stops.')}</p>

<h3>${w('Your bet', 'Your play')}</h3>
<p>Choose a difficulty: it sets how many steps your window covers. Then drag the window along the mountain (or use the arrows). If Ueli stops inside your window, you win.</p>
<p>Higher steps are rarer, so a window higher up ${w('pays more', 'wins more')}. The sign above your window shows what it ${w('pays', 'wins')} and how often it wins.</p>
<table><thead><tr><th>Difficulty</th><th>Window</th><th>${w('Pays', 'Wins')} (× ${w('bet', 'play amount')})</th></tr></thead><tbody>${rows}
<tr><td><b>Over the Edge</b></td><td>he falls past step ${r.top}</td><td>${x(edge.pay)}</td></tr></tbody></table>
<p>Every mode costs 1× the ${w('bet', 'play amount')}. <b>Over the Edge</b> wins only if he really falls. If Barry the St. Bernard pulls him back, he ends on step ${r.top}.</p>

<h3>The climb</h3>
<p>Where Ueli stops is decided when the round starts. The climb then shows how he gets there: three climbs of 0 to ${r.maxClimb} steps. Before each climb the counter spins and stops on how many steps he takes, then counts down as his cowbell rings once for every step; 0 means he stops to yodel. Sometimes:</p>
<ul>
<li><b>Gondola:</b> carries him up a few steps.</li>
<li><b>Avalanche:</b> knocks him back down a few steps.</li>
<li><b>Alphorn Echo:</b> his last climb happens again.</li>
<li><b>Föhn Wind:</b> pushes him a step or three up or down.</li>
<li><b>Barry's Rescue:</b> when he goes over the edge, the dog may pull him back to step ${r.top}.</li>
</ul>
<p>These moments never change where he stops or what you win.</p>

<h3>Edelweiss</h3>
<p>Edelweiss are hidden along the way. Each one he reaches adds +${r.bloomBonus}× to the win multiplier; a Golden Edelweiss multiplies the win by ${r.goldenMult}. They only count if you win.</p>

<h3>Return and maximum win</h3>
<p>RTP: ${rtpLine}. Maximum win: ${maxWin} the ${w('bet', 'play amount')} in every mode.</p>

<h3>Controls</h3>
<ul>
<li><b>Menu (☰):</b> these rules and sound.</li>
<li><b>Difficulty:</b> choose Easy, Medium, Hard, Pinpoint or Over the Edge.</li>
<li><b>The sign over your window:</b> drag it (or anywhere on the mountain) to move the window; tap its ◀ ▶ arrows to move it one step. The arrow keys do the same.</li>
<li><b>− / +:</b> ${w('lower or raise the bet', 'lower or raise the play amount')}.</li>
<li><b>Climb!</b> (or the space bar): ${w('places the bet and starts the climb', 'starts the climb')}.</li>
<li><b>Turbo (»):</b> plays the climb twice as fast. Tap again to turn it off.</li>
<li><b>Autoplay (↻):</b> opens a panel to choose how many climbs (10, 25, 50 or 100) and when to stop early (after any win, or after a win of 20× or more); nothing starts until you press Start. While it runs, Climb becomes <b>Stop</b> and shows the climbs left; Stop or the space bar ends it. It also stops when your balance is too low.</li>
<li><b>Sound (in the menu):</b> turns all sound on or off.</li>
<li><b>Close (✕):</b> closes a menu.</li>
</ul>

<h3>Disclaimer</h3>
<p>Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display is not representative of any physical device and is for illustrative purposes only. Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser. TM and © 2026 Engine.</p>`;
}
