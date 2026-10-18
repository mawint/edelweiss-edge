// Edelweiss Edge: the mountain (src/scene.ts), the deck of controls, and the RGS. Every round comes from the
// RGS (Stake's, the dev server's mock, or the hosted demo's in-page mock) and is staged from its book by
// src/director.ts; the screen never decides an outcome or adds up money.
import './style.css';
import { DIFFICULTIES, FIXTURES, modeFor, startsFor, type BetMode, type ClimbPlan, type Difficulty } from './book';
import { stageRound } from './director';
import { Scene } from './scene';
import { payRange, rulesHtml, widthOf } from './rules';
import { setSound, soundOn, unlockSound } from './sound';
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
  difficulty: 'medium' as Choice,
  from: 11,
  bet: 1,
  betLevels: [] as number[],
  balance: 0,
  currency: launch.currency,
  plan: null as ClimbPlan | null,
  /** QA probes set this to stage rounds without animation. */
  instant: false,
  history: [] as { mode: BetMode; win: number }[],
};
const rgs = connect();
const money = (v: number) => formatMoney(v, state.currency);
const scene = new Scene($<HTMLCanvasElement>('scene'));
const announce = (text: string) => ($('callout').textContent = text);
const metres = (s: number) => `${(FIXTURES.rules.baseMetres + s * FIXTURES.rules.metresPerStep).toLocaleString('de-CH')} m`;

/** The bet mode the controls point at. */
function currentMode(): BetMode {
  if (state.difficulty === 'edge') return 'edge';
  return modeFor(state.difficulty, state.from)!;
}
const NAMES: Record<Choice, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', pinpoint: 'Pinpoint', edge: 'Over the Edge' };
const oneIn = (mode: BetMode) => (1 / (1 - (FIXTURES.modes[mode].kinds.loss ?? 0))).toFixed(1);

/** Move the window so it starts on `from`, clamped to the starts this difficulty offers. */
function moveWindow(from: number) {
  if (state.difficulty === 'edge' || state.phase !== 'idle' || anySheetOpen()) return;
  state.from = from;
  syncControls();
}
function clampWindow() {
  if (state.difficulty === 'edge') return;
  const starts = startsFor(state.difficulty);
  state.from = Math.min(Math.max(state.from, starts[0]), starts[starts.length - 1]);
}

// ---------- controls ----------
function syncControls() {
  clampWindow();
  const mode = currentMode();
  const m = FIXTURES.modes[mode];
  const win = m.window;
  const where = win === 'edge' ? 'over the edge' : win[0] === win[1] ? `step ${win[0]} (${metres(win[0])})` : `steps ${win[0]} to ${win[1]} (${metres(win[0])} to ${metres(win[1])})`;
  scene.setWindow(win === 'edge' ? 'edge' : { from: win[0], to: win[1] }, { pay: `${m.pay.toFixed(1)}×`, odds: `wins 1 in ${oneIn(mode)}` });
  $('scene').setAttribute('aria-label', say(`Your window: ${where}. Pays ${m.pay.toFixed(1)} times the bet, wins 1 in ${oneIn(mode)}. Drag the sign over it, or use the arrow keys, to move it.`, `Your window: ${where}. Wins ${m.pay.toFixed(1)} times the play amount, 1 in ${oneIn(mode)}. Drag the sign over it, or use the arrow keys, to move it.`));
  $('diff-label').textContent = NAMES[state.difficulty];
  $('bet').textContent = money(state.bet);
  $('balance').textContent = money(state.balance);
  const busy = state.phase !== 'idle' || !state.ready;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.deck button')) b.disabled = busy && b.id !== 'menu-open';
  scene.dragEnabled = !busy && state.difficulty !== 'edge';
}

/** The difficulty sheet: each choice with its window width and what it pays from the bottom to the top. */
function renderDifficulties() {
  const list = $('diff-list');
  const choices: Choice[] = [...DIFFICULTIES, 'edge'];
  list.innerHTML = choices
    .map((d) => {
      const detail = d === 'edge' ? 'He falls past step 25' : `${widthOf(d)} step${widthOf(d) > 1 ? 's' : ''} wide`;
      const range = d === 'edge' ? `${FIXTURES.modes.edge.pay.toFixed(1)}×` : payRange(d).map((v) => `${v.toFixed(1)}×`).join(' – ');
      return `<button type="button" class="choice${d === 'edge' ? ' edge' : ''}" data-difficulty="${d}" aria-pressed="${d === state.difficulty}"><b>${NAMES[d]}</b><span class="range">${range}</span><small>${detail}</small></button>`;
    })
    .join('');
}

const anySheetOpen = () => !!document.querySelector('dialog[open]');
function openSheet(id: string) {
  const d = $<HTMLDialogElement>(id);
  if (id === 'diff-sheet') renderDifficulties();
  if (id === 'menu-sheet') $('rules').innerHTML = rulesHtml(social);
  d.showModal();
}

const TURBO_KEY = 'edelweiss.turbo';
function readTurbo() {
  try {
    return localStorage.getItem(TURBO_KEY) === 'on';
  } catch {
    return false;
  }
}

function wireControls() {
  $('diff-open').addEventListener('click', () => openSheet('diff-sheet'));
  $('menu-open').addEventListener('click', () => openSheet('menu-sheet'));
  for (const d of document.querySelectorAll<HTMLDialogElement>('dialog')) {
    d.querySelector('.close')!.addEventListener('click', () => d.close());
    // (a tap on the backdrop closes it too)
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  }
  $('diff-list').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-difficulty]');
    if (!b || state.phase !== 'idle') return;
    // Keep the window centred on the same spot when its width changes
    const oldWidth = state.difficulty === 'edge' ? 1 : widthOf(state.difficulty);
    const centre = state.from + (oldWidth - 1) / 2;
    state.difficulty = b.dataset.difficulty as Choice;
    if (state.difficulty !== 'edge') state.from = Math.round(centre - (widthOf(state.difficulty) - 1) / 2);
    syncControls();
    $<HTMLDialogElement>('diff-sheet').close();
  });
  // The window moves on the mountain: drag anywhere (it centres on the step under the pointer), or tap the sign's arrows
  scene.onDrag = (step) => {
    if (state.difficulty === 'edge') return;
    moveWindow(step - Math.floor((widthOf(state.difficulty) - 1) / 2));
  };
  scene.onNudge = (dir) => moveWindow(state.from + dir);
  const stepBet = (dir: number) => {
    const i = state.betLevels.indexOf(state.bet);
    state.bet = state.betLevels[Math.min(state.betLevels.length - 1, Math.max(0, i + dir))] ?? state.bet;
    syncControls();
  };
  $('bet-down').addEventListener('click', () => stepBet(-1));
  $('bet-up').addEventListener('click', () => stepBet(1));
  $('climb').addEventListener('click', () => void climb());

  const sound = $<HTMLButtonElement>('sound');
  const showSound = () => { sound.setAttribute('aria-pressed', String(soundOn())); sound.querySelector('b')!.textContent = soundOn() ? 'On' : 'Off'; };
  sound.addEventListener('click', () => { setSound(!soundOn()); showSound(); });
  showSound();
  const turbo = $<HTMLButtonElement>('turbo');
  const showTurbo = () => { const on = scene.speed > 1; turbo.setAttribute('aria-pressed', String(on)); turbo.querySelector('b')!.textContent = on ? 'On' : 'Off'; };
  scene.speed = readTurbo() ? 2 : 1;
  turbo.addEventListener('click', () => {
    scene.speed = scene.speed > 1 ? 1 : 2;
    try {
      localStorage.setItem(TURBO_KEY, scene.speed > 1 ? 'on' : 'off');
    } catch {
      /* the setting just won't persist */
    }
    showTurbo();
  });
  showTurbo();

  // Review item [228]: space does what Climb does, but never while a menu is open; arrows move the window
  window.addEventListener('keydown', (e) => {
    if (anySheetOpen()) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!(e.target instanceof HTMLButtonElement) || e.target.id === 'climb') void climb();
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      moveWindow(state.from + (e.code === 'ArrowRight' ? 1 : -1));
    }
  });
  // The scene frames the ridge above the deck, whatever size the deck wraps to
  const deck = $('deck');
  const inset = () => scene.setInsets(0, window.innerHeight - deck.getBoundingClientRect().top + 6);
  new ResizeObserver(inset).observe(deck);
  window.addEventListener('resize', inset);
  inset();
}

// ---------- a round ----------
async function climb() {
  if (state.phase !== 'idle' || !state.ready || anySheetOpen()) return;
  unlockSound();
  showError('');
  state.phase = 'climbing';
  syncControls();
  try {
    const mode = currentMode();
    const { balance, round } = await rgs.play(Math.round(state.bet * MICRO), mode);
    state.balance = balance.amount / MICRO;
    syncControls();
    state.plan = await stageRound(bookOf(round), scene, { format: money, bet: state.bet, social, instant: state.instant, announce });
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
    // (a round left open by a refresh: show where it ended and settle it)
    if (auth.round?.active) {
      state.plan = await stageRound(bookOf(auth.round), scene, { format: money, bet: state.bet, social, instant: true, announce });
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
    unlockSound();
    const book = { id: Number(r.event), payoutMultiplier: Math.round(recorded.payoutMultiplier * 100), events: recorded.state };
    state.plan = await stageRound(book, scene, { format: money, bet: r.amount ? r.amount / MICRO : 1, social, announce });
  } catch (e) {
    showError(describe(e));
  }
}

// QA hooks (qa/probes): the state, and the round and setup actions
Object.assign(window, { game: { state, climb, syncControls, DIFFICULTIES } });
void start();
