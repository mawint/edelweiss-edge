// Placeholder screen for Edelweiss Edge: the ridge's 26 steps, a window slider, and Climb. Every round
// comes from the RGS (Stake's, the dev server's mock, or the hosted demo's in-page mock) and is staged
// from its book; the screen never decides an outcome or adds up money. The real art comes later.
import './style.css';
import { DIFFICULTIES, FIXTURES, TOP, modeFor, planRound, startsFor, type BetMode, type ClimbPlan, type Difficulty } from './book';
import { MICRO, RgsError, fetchReplay, formatMoney, httpRgs, readLaunch, type Rgs, type RgsRound } from './rgs';
import { demoRgs } from './rgs-mock';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- the RGS ----------
const launch = readLaunch(location.search);
/** The build Stake gets (`npm run build:stake`): it only ever talks to the RGS its launch URL names. */
const STAKE = import.meta.env.MODE === 'stake';
const DEMO_KEY = 'edelweiss.demo-rgs';
const DEV_SESSION_KEY = 'edelweiss.dev-session';

// ---------- wording: a social casino (Stake.US) can't say bet, buy, pay, paid... ----------
let social = launch.social;
/** `normal` text, or its social-casino wording. */
const say = (normal: string, socialText: string) => (social ? socialText : normal);
/** Static text in index.html carries its social wording in data-social (and data-social-label for aria-label). */
function applyWording() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-social]')) {
    el.dataset.normal ??= el.textContent ?? '';
    el.textContent = social ? el.dataset.social! : el.dataset.normal;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-social-label]')) {
    el.dataset.normalLabel ??= el.getAttribute('aria-label') ?? '';
    el.setAttribute('aria-label', social ? el.dataset.socialLabel! : el.dataset.normalLabel);
  }
}

/**
 * Where rounds come from: Stake's RGS when the launch URL names one; the dev server's mock RGS in
 * development (mock-rgs/: the math's full books, else the fixtures); otherwise, for the hosted demo,
 * the same mock running in the page over the fixtures, its wallet kept in this browser.
 */
function connect(): Rgs {
  if (launch.rgsUrl) return httpRgs(launch.rgsUrl, launch.sessionID ?? '');
  if (STAKE) return noRgs();
  if (import.meta.env.DEV) return httpRgs(devRgs(), devSession());
  let restore;
  try {
    restore = JSON.parse(localStorage.getItem(DEMO_KEY) ?? 'null') ?? undefined;
  } catch {
    /* no storage: a fresh demo wallet */
  }
  const persist = (sessions: object) => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(sessions));
    } catch {
      /* ignore */
    }
  };
  return demoRgs({ restore, persist });
}
/** A Stake build launched with no rgs_url: every request fails, so the game shows it can't connect. */
function noRgs(): Rgs {
  const fail = () => Promise.reject(new RgsError('ERR_VAL', 'no rgs_url in the launch URL'));
  return { authenticate: fail, balance: fail, play: fail, endRound: fail, event: fail };
}
const devRgs = () => `${location.protocol}//${location.host}/rgs`;
function devSession() {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEV_SESSION_KEY);
    if (!id) localStorage.setItem(DEV_SESSION_KEY, (id = `dev-${Math.random().toString(16).slice(2, 10)}`));
  } catch {
    /* no storage: a session for this page only */
  }
  return id ?? `dev-${Math.random().toString(16).slice(2, 10)}`;
}

// ---------- state ----------
type Choice = Difficulty | 'edge';
const state = {
  ready: false,
  phase: 'idle' as 'idle' | 'climbing',
  difficulty: 'easy' as Choice,
  from: 10,
  bet: 1,
  betLevels: [] as number[],
  balance: 0,
  currency: launch.currency,
  step: 0,
  plan: null as ClimbPlan | null,
  /** The blooms picked so far this round (they're hidden until he reaches them). */
  blooms: [] as { step: number; golden: boolean }[],
  history: [] as { mode: BetMode; win: number }[],
};
const rgs = connect();
const money = (v: number) => formatMoney(v, state.currency);
const widthOf = (d: Difficulty) => FIXTURES.modes[modeFor(d, startsFor(d)[0])!].window as [number, number];

/** The bet mode the controls point at. */
function currentMode(): BetMode {
  if (state.difficulty === 'edge') return 'edge';
  return modeFor(state.difficulty, state.from)!;
}

// ---------- the ridge ----------
function buildRidge() {
  const ridge = $('ridge');
  for (let s = 0; s <= TOP; s++) {
    const step = document.createElement('div');
    step.className = 'step';
    step.dataset.step = String(s);
    step.style.setProperty('--h', `${12 + (s / TOP) * 88}%`);
    step.title = `Step ${s}: ${FIXTURES.rules.baseMetres + s * FIXTURES.rules.metresPerStep} m`;
    step.innerHTML = `<span class="n">${s}</span>`;
    ridge.append(step);
  }
  const edge = document.createElement('div');
  edge.className = 'step edge';
  edge.innerHTML = '<span class="n">edge</span>';
  ridge.append(edge);
  const ueli = document.createElement('div');
  ueli.id = 'ueli';
  ueli.textContent = 'U';
  ueli.title = 'Ueli';
  ridge.append(ueli);
}

function drawRidge() {
  const mode = FIXTURES.modes[currentMode()];
  const [lo, hi] = mode.window === 'edge' ? [TOP + 1, TOP + 1] : mode.window;
  const blooms = state.blooms;
  for (const el of document.querySelectorAll<HTMLElement>('.step')) {
    const s = el.classList.contains('edge') ? TOP + 1 : Number(el.dataset.step);
    el.classList.toggle('in-window', s >= lo && s <= hi);
    const bloom = blooms.find((b) => b.step === s);
    el.classList.toggle('bloom', !!bloom && !bloom.golden);
    el.classList.toggle('golden', !!bloom?.golden);
  }
  const ueli = $('ueli');
  const at = Math.min(state.step, TOP + 1);
  ueli.style.setProperty('--at', String(at));
  ueli.classList.toggle('over', state.step > TOP);
}

// ---------- controls ----------
function syncControls() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-difficulty]')) {
    b.setAttribute('aria-pressed', String(b.dataset.difficulty === state.difficulty));
  }
  const slider = $<HTMLInputElement>('slider');
  const row = $('slider-row');
  row.hidden = state.difficulty === 'edge';
  if (state.difficulty !== 'edge') {
    const starts = startsFor(state.difficulty);
    state.from = Math.min(Math.max(state.from, starts[0]), starts[starts.length - 1]);
    slider.min = String(starts[0]);
    slider.max = String(starts[starts.length - 1]);
    slider.value = String(state.from);
    const [first, last] = widthOf(state.difficulty);
    const [lo, hi] = [state.from, state.from + last - first];
    $('window-label').textContent = lo === hi ? `step ${lo}` : `steps ${lo}–${hi}`;
  }
  const mode = FIXTURES.modes[currentMode()];
  $('pays').textContent = say(`Pays ${mode.pay}× the bet`, `Wins ${mode.pay}× the play amount`) + ` · ${blurb(mode.kinds)}`;
  $('bet').textContent = money(state.bet);
  $('balance').textContent = money(state.balance);
  const busy = state.phase !== 'idle' || !state.ready;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.controls button')) b.disabled = busy;
  slider.disabled = busy;
  drawRidge();
}

/** How often the chosen bet wins, from the exported odds. */
const blurb = (kinds: Record<string, number>) => `wins about 1 in ${(1 / (1 - (kinds.loss ?? 0))).toFixed(1)}`;

function wireControls() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-difficulty]')) {
    b.addEventListener('click', () => {
      state.difficulty = b.dataset.difficulty as Choice;
      syncControls();
    });
  }
  $<HTMLInputElement>('slider').addEventListener('input', (e) => {
    state.from = Number((e.target as HTMLInputElement).value);
    syncControls();
  });
  const stepBet = (dir: number) => {
    const i = state.betLevels.indexOf(state.bet);
    state.bet = state.betLevels[Math.min(state.betLevels.length - 1, Math.max(0, i + dir))] ?? state.bet;
    syncControls();
  };
  $('bet-down').addEventListener('click', () => stepBet(-1));
  $('bet-up').addEventListener('click', () => stepBet(1));
  $('climb').addEventListener('click', () => void climb());
}

// ---------- a round ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const callout = (text: string) => ($('callout').textContent = text);

/** Stage a round's moves one by one, then its result. */
async function stage(plan: ClimbPlan, pace = 700) {
  state.plan = plan;
  state.step = 0;
  state.blooms = [];
  callout('Ueli sets off from base camp');
  drawRidge();
  for (const move of plan.moves) {
    await sleep(pace);
    state.step = move.to;
    if (move.bloom) state.blooms.push(move.bloom);
    callout(move.label);
    drawRidge();
  }
  await sleep(pace);
  state.step = plan.step;
  drawRidge();
  const mult = plan.multiplier > 1 ? ` (×${plan.multiplier} edelweiss)` : '';
  callout(plan.inWindow ? `He stopped in the window! Won ${plan.win}×${mult}` : plan.step > TOP ? 'Over the edge: not this time' : `Step ${plan.step}: not this time`);
}

async function climb() {
  if (state.phase !== 'idle') return;
  showError('');
  state.phase = 'climbing';
  syncControls();
  try {
    const mode = currentMode();
    const { balance, round } = await rgs.play(Math.round(state.bet * MICRO), mode);
    state.balance = balance.amount / MICRO;
    syncControls();
    await stage(planRound(bookOf(round)));
    if (round.active) state.balance = (await rgs.endRound()).balance.amount / MICRO;
    state.history.unshift({ mode, win: round.payout / MICRO });
  } catch (e) {
    showError(describe(e));
  } finally {
    state.phase = 'idle';
    syncControls();
  }
}

const bookOf = (round: RgsRound) => ({ id: round.betID, payoutMultiplier: Math.round(round.payoutMultiplier * 100), events: round.state });

function describe(e: unknown): string {
  if (!(e instanceof RgsError)) return 'Something went wrong. Try again.';
  const says: Record<string, string> = {
    ERR_IPB: say('Your balance is too low for this bet.', 'Your balance is too low for this play.'),
    ERR_GLE: say('Your gambling limits stop this bet.', 'Your play limits stop this play.'),
    ERR_ACT: 'Busy: try again in a moment.',
    ERR_NETWORK: 'Could not reach the game server.',
  };
  return says[e.code] ?? `The game server refused: ${e.message}`;
}
const showError = (text: string) => ($('error').textContent = text);

// ---------- start ----------
async function start() {
  applyWording();
  buildRidge();
  wireControls();
  syncControls();
  if (launch.replay) return replay();
  try {
    const auth = await rgs.authenticate();
    social ||= !!auth.config.jurisdiction?.socialCasino;
    applyWording();
    state.currency = auth.balance.currency;
    state.balance = auth.balance.amount / MICRO;
    state.betLevels = auth.config.betLevels.map((v) => v / MICRO);
    state.bet = auth.config.defaultBetLevel / MICRO;
    state.ready = true;
    syncControls();
    // (a round left open by a refresh: show where it ended and pay it)
    if (auth.round?.active) {
      await stage(planRound(bookOf(auth.round)), 0);
      state.balance = (await rgs.endRound()).balance.amount / MICRO;
      syncControls();
    }
  } catch (e) {
    showError(describe(e));
  }
}

/** A replay link: play the one recorded round, no wallet. */
async function replay() {
  const r = launch.replay!;
  const base = launch.rgsUrl ?? (import.meta.env.DEV ? devRgs() : null);
  if (!base) return showError('No game server in the replay link.');
  try {
    const recorded = await fetchReplay(base, r);
    const mode = FIXTURES.modes[r.mode as BetMode];
    if (mode) {
      state.difficulty = mode.difficulty;
      if (mode.window !== 'edge') state.from = mode.window[0];
    }
    syncControls();
    await stage(planRound({ id: Number(r.event), payoutMultiplier: Math.round(recorded.payoutMultiplier * 100), events: recorded.state }));
  } catch (e) {
    showError(describe(e));
  }
}

// QA hooks (qa/probes): the state, and the round and setup actions
Object.assign(window, { game: { state, climb, syncControls, DIFFICULTIES } });
void start();
