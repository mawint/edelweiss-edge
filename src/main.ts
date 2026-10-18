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
  const autoplaying = auto.left > 0;
  const busy = state.phase !== 'idle' || !state.ready || autoplaying;
  // (menu and turbo stay live mid-round; during autoplay Climb becomes Stop)
  for (const b of document.querySelectorAll<HTMLButtonElement>('.deck button')) b.disabled = busy && !['menu-open', 'turbo'].includes(b.id);
  const climbBtn = $<HTMLButtonElement>('climb');
  climbBtn.classList.toggle('stop', autoplaying);
  climbBtn.querySelector('span')!.textContent = autoplaying ? `Stop · ${auto.left}` : 'Climb!';
  climbBtn.disabled = autoplaying ? false : busy;
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

const anySheetOpen = () => !!document.querySelector('dialog[open]') || !$('splash').hidden;

// ---------- autoplay (review item [104]: it only starts from the panel's confirm button) ----------
const auto = { left: 0, rounds: 25, stopOnWin: false, stopOnBig: true };
/** A single win this many times the bet stops autoplay when that box is ticked. */
const BIG_WIN = 20;

async function runAutoplay() {
  auto.left = auto.rounds;
  syncControls();
  try {
    while (auto.left > 0) {
      if (state.balance < state.bet) { showError(say('Autoplay stopped: your balance is too low for this bet.', 'Autoplay stopped: your balance is too low for this play.')); break; }
      // (a menu opened mid-autoplay pauses it rather than stopping it)
      while (anySheetOpen() && auto.left > 0) await new Promise((r) => setTimeout(r, 200));
      if (auto.left === 0) break;
      auto.left--;
      syncControls();
      const plan = await climb();
      if (!plan) break;
      if ((auto.stopOnWin && plan.win > 0) || (auto.stopOnBig && plan.win >= BIG_WIN)) break;
      await new Promise((r) => setTimeout(r, scene.speed > 1 ? 250 : 600));
    }
  } finally {
    auto.left = 0;
    syncControls();
  }
}
const stopAutoplay = () => { auto.left = 0; syncControls(); };
function openSheet(id: string) {
  const d = $<HTMLDialogElement>(id);
  if (id === 'diff-sheet') renderDifficulties();
  if (id === 'menu-sheet') $('rules').innerHTML = rulesHtml(social);
  if (id === 'auto-sheet') syncAutoSheet();
  d.showModal();
}

function syncAutoSheet() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-rounds]')) b.setAttribute('aria-pressed', String(Number(b.dataset.rounds) === auto.rounds));
  $<HTMLInputElement>('auto-stop-win').checked = auto.stopOnWin;
  $<HTMLInputElement>('auto-stop-big').checked = auto.stopOnBig;
  $('auto-start').querySelector('span')!.textContent = `Start ${auto.rounds} climbs`;
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
  $('climb').addEventListener('click', () => (auto.left > 0 ? stopAutoplay() : void climb()));
  $('auto-open').addEventListener('click', () => openSheet('auto-sheet'));
  $('auto-rounds').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rounds]');
    if (!b) return;
    auto.rounds = Number(b.dataset.rounds);
    syncAutoSheet();
  });
  $<HTMLInputElement>('auto-stop-win').addEventListener('change', (e) => { auto.stopOnWin = (e.target as HTMLInputElement).checked; });
  $<HTMLInputElement>('auto-stop-big').addEventListener('change', (e) => { auto.stopOnBig = (e.target as HTMLInputElement).checked; });
  $('auto-start').addEventListener('click', () => {
    $<HTMLDialogElement>('auto-sheet').close();
    unlockSound();
    void runAutoplay();
  });

  // Sound: the corner button and the menu's toggle are the same switch
  const sound = $<HTMLButtonElement>('sound'), corner = $<HTMLButtonElement>('sound-corner');
  const showSound = () => {
    sound.setAttribute('aria-pressed', String(soundOn())); sound.querySelector('b')!.textContent = soundOn() ? 'On' : 'Off';
    corner.setAttribute('aria-pressed', String(soundOn())); corner.setAttribute('aria-label', soundOn() ? 'Sound on' : 'Sound off');
  };
  for (const b of [sound, corner]) b.addEventListener('click', () => { setSound(!soundOn()); showSound(); });
  showSound();
  const turbo = $<HTMLButtonElement>('turbo');
  const showTurbo = () => turbo.setAttribute('aria-pressed', String(scene.speed > 1));
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
      if (auto.left > 0) stopAutoplay();
      else if (!(e.target instanceof HTMLButtonElement) || e.target.id === 'climb') void climb();
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
/** One round. Returns what it staged, or null if it couldn't be played. */
async function climb(): Promise<ClimbPlan | null> {
  if (state.phase !== 'idle' || !state.ready || anySheetOpen()) return null;
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
    return state.plan;
  } catch (e) {
    showError(describe(e));
    return null;
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
// ---------- title screen ----------
let loadShown = 0;
/** Move the loader's bar to `share` (0..1, never backwards) and say what's happening. */
const setLoad = (share: number, text: string) => {
  loadShown = Math.max(loadShown, share);
  $('load-bar').style.transform = `scaleX(${loadShown})`;
  $('load').setAttribute('aria-valuenow', String(Math.round(loadShown * 100)));
  $('load-text').textContent = text;
};
let entered: () => void = () => {};
/** enter() called before Play was showing (a probe, or a very quick tap): go in as soon as it shows. */
let enterEarly = false;
/** Shows Play and resolves once the player taps it: that tap is also what lets the browser play sound. */
function waitForPlay(): Promise<void> {
  const play = $<HTMLButtonElement>('play');
  $('load').hidden = true;
  play.hidden = false;
  $('splash').classList.add('ready');
  // (no play.focus(): browsers drew a focus ring around it; Enter and Space are caught by wireSplash's handler)
  return new Promise((resolve) => { entered = resolve; if (enterEarly) enter(); });
}
function enter() {
  if ($('play').hidden) { enterEarly = true; return; }
  unlockSound();
  const splash = $('splash');
  // The loader fades out over the game's cloud bank, which then sweeps away to show the mountain
  scene.revealWipe();
  splash.classList.add('done');
  setTimeout(() => { splash.hidden = true; }, 350);
  $<HTMLButtonElement>('play').hidden = true;
  entered();
}
function wireSplash() {
  // A tap anywhere on the loader goes in once it's ready, like Crush Depth's
  $('splash').addEventListener('click', enter);
  $('retry').addEventListener('click', () => location.reload());
  // (Enter and Space press the focused Play button on their own; this catches them if focus wandered)
  window.addEventListener('keydown', (e) => {
    if ($('splash').hidden || $('play').hidden) return;
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); enter(); }
  });
}
/** The loader's fatal screen: what went wrong and a Reload button. */
function splashError(text: string) {
  $('load').hidden = true;
  $('splash-error').textContent = text;
  $('fatal').hidden = false;
}

async function start() {
  applyWording();
  wireControls();
  wireSplash();
  syncControls();
  setLoad(0.15, 'Loading');
  await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
  setLoad(0.5, 'Connecting');
  if (launch.replay) { setLoad(1, 'Ready'); await waitForPlay(); return replay(); }
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
    setLoad(1, 'Ready');
    // (a round left open by a refresh: show where it ended and settle it)
    if (auth.round?.active) {
      state.plan = await stageRound(bookOf(auth.round), scene, { format: money, bet: state.bet, social, instant: true, announce });
      state.balance = (await rgs.endRound()).balance.amount / MICRO;
      syncControls();
    }
    await waitForPlay();
  } catch (e) {
    splashError(describe(e));
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

// iOS Safari zooms on a double tap and a pinch even with user-scalable=no: cancel both (review item [223])
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now();
  if (now - lastTouchEnd < 320) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

// QA hooks (qa/probes): the state, and the round and setup actions
Object.assign(window, { game: { state, climb, syncControls, enter, DIFFICULTIES } });
void start();
