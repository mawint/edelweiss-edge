// Rounds as the math decides them. Each round is one "book" from the math repo
// (mawint/edelweiss-edge-math, games/edelweiss_edge): a list of events saying how Ueli climbs and what
// the round pays. The game stages those events; it never decides an outcome or adds up money itself.
// The events are listed in docs/GAME_DESIGN.md (Book events).
//
// Until the game talks to Stake's server, rounds come from fixtures/books.json (the math's
// export_fixtures.py). The page only carries the export's numbers (modes, pays, odds); the books
// themselves are fetched on their own.
import { modes, rules, source } from '../fixtures/books.json';
import booksUrl from '../fixtures/books.json?url';

/** The ridge: step 0 is base camp, TOP the top station; past it he goes over the edge. */
export const TOP = 25;

export type Difficulty = 'easy' | 'medium' | 'hard' | 'pinpoint';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'pinpoint'];
/** A bet mode: `${difficulty}_${start step}` (a window), or 'edge' (Over the Edge). */
export type BetMode = `${Difficulty}_${number}` | 'edge';
export type Window = { from: number; to: number } | 'edge';
export type FeatureKind = 'gondola' | 'avalanche' | 'echo' | 'foehn' | 'rescue';

/**
 * Book events. Amounts are hundredths of the bet (250 = 2.50×); steps run 0..25, past 25 is over the edge.
 * Every move's `to` is where the next one starts from; settle's win is the round's finalWin.
 */
export type BookEvent = { index: number } & (
  /** The bet's difficulty and window, and what it pays before the multiplier. Blooms stay hidden until reached. */
  | { type: 'reveal'; difficulty: Difficulty | 'edge'; window: Window; pay: number }
  /** Climb `n` of 3: Ueli climbs `steps` (0: he stops to yodel) to step `to`. */
  | { type: 'climb'; n: number; steps: number; to: number }
  /** A feature moves him to step `to`. */
  | { type: 'feature'; kind: FeatureKind; to: number }
  /** He reaches an edelweiss on `step` and picks it: the win multiplier so far is `multiplier` (150 = ×1.5). */
  | { type: 'bloom'; step: number; golden: boolean; multiplier: number }
  /** He goes over the edge from `step` (26+); a rescue may follow. */
  | { type: 'fall'; step: number }
  /** Where he ends, whether the bet won, the blooms picked, the multiplier (150 = ×1.5) and the win. */
  | { type: 'settle'; step: number; inWindow: boolean; blooms: number; multiplier: number; win: number }
  | { type: 'wincap'; amount: number }
  | { type: 'finalWin'; amount: number }
);

export interface Book {
  id: number;
  payoutMultiplier: number;
  events: BookEvent[];
}
export interface FixtureBook extends Book {
  mode: BetMode;
  kind: string;
}
export interface ModeInfo {
  cost: number;
  rtp: number;
  maxWin: number;
  difficulty: Difficulty | 'edge';
  window: [number, number] | 'edge';
  /** What the window pays (× bet) before the edelweiss multiplier. */
  pay: number;
  /** Each kind of round's share of the mode (loss, win, max win). */
  kinds: Record<string, number>;
}
export interface FixturesMeta {
  source: { repo: string; version: string; exported: string };
  rules: {
    top: number;
    climbs: number;
    maxClimb: number;
    baseMetres: number;
    metresPerStep: number;
    /** Where he stops, out of 100,000: steps '0'..'25' and 'edge'. Of step 25's, `rescued` are told as a fall and a rescue. */
    stopWeights: Record<string, number>;
    rescued: number;
    bloomBonus: number;
    goldenMult: number;
    maxWin: number;
  };
  modes: Record<BetMode, ModeInfo>;
}
export const FIXTURES = { source, rules, modes } as unknown as FixturesMeta;
export const BET_MODES = Object.keys(FIXTURES.modes) as BetMode[];

/** The bet mode for a window of `difficulty` starting on step `from` (null: not offered there). */
export function modeFor(difficulty: Difficulty, from: number): BetMode | null {
  const mode = `${difficulty}_${from}` as BetMode;
  return mode in FIXTURES.modes ? mode : null;
}

/** The start steps a difficulty is offered on, ascending. */
export const startsFor = (difficulty: Difficulty) =>
  BET_MODES.filter((m) => m.startsWith(`${difficulty}_`)).map((m) => Number(m.split('_')[1])).sort((a, b) => a - b);

/** The exported books themselves (only the demo's stand-in server plays them): their own download. */
export async function loadFixtureBooks(): Promise<FixtureBook[]> {
  const r = await fetch(booksUrl);
  if (!r.ok) throw new Error(`the demo's rounds could not be loaded: ${r.status}`);
  return ((await r.json()) as { books: FixtureBook[] }).books;
}

/** A round's kind, by the same rules as the math's fixture export: the cap, a win, or a loss. */
export function kindOf(book: Book, maxWin = 5000): string {
  if (book.payoutMultiplier >= maxWin * 100) return 'max win';
  return book.payoutMultiplier > 0 ? 'win' : 'loss';
}

/** One beat of the story, as the screen stages it: a move up or down the ridge, or a bloom picked. */
export interface Move {
  label: string;
  /** Where he stands after it. */
  to: number;
  fall?: boolean;
  bloom?: { step: number; golden: boolean };
}

/** What one round stages. Every amount is a multiple of the bet. */
export interface ClimbPlan {
  window: Window;
  pay: number;
  /** Every bloom he picks, in the order he reaches them (each is also a move). */
  blooms: { step: number; golden: boolean }[];
  moves: Move[];
  /** Where he ends: past TOP when he went over the edge (and wasn't rescued). */
  step: number;
  inWindow: boolean;
  multiplier: number;
  win: number;
}

const FEATURE_LABEL: Record<FeatureKind, string> = {
  gondola: 'Gondola Lift',
  avalanche: 'Avalanche!',
  echo: 'Alphorn Echo',
  foehn: 'Föhn Wind',
  rescue: "Barry's Rescue",
};

/** A book as the screen stages it. Throws on a book that doesn't add up (a bad export). */
export function planRound(book: Book): ClimbPlan {
  const reveal = book.events.find((e) => e.type === 'reveal');
  const settle = book.events.find((e) => e.type === 'settle');
  if (!reveal || !settle) throw new Error(`book ${book.id} has no reveal or settle`);
  const moves: Move[] = [];
  let at = 0;
  for (const e of book.events) {
    if (e.type === 'climb') moves.push({ label: e.steps ? `Climb ${e.n} of 3: ${e.steps} step${e.steps > 1 ? 's' : ''}` : `Climb ${e.n} of 3: he stops to yodel`, to: (at = e.to) });
    else if (e.type === 'feature') moves.push({ label: FEATURE_LABEL[e.kind], to: (at = e.to) });
    else if (e.type === 'fall') moves.push({ label: 'Over the edge!', to: (at = e.step), fall: true });
    else if (e.type === 'bloom') moves.push({ label: `${e.golden ? 'Golden Edelweiss' : 'Edelweiss'}! ×${e.multiplier / 100}`, to: at, bloom: { step: e.step, golden: e.golden } });
  }
  if (settle.win !== book.payoutMultiplier) throw new Error(`book ${book.id}: settle pays ${settle.win}, the book ${book.payoutMultiplier}`);
  return {
    window: reveal.window,
    pay: reveal.pay / 100,
    blooms: moves.flatMap((m) => (m.bloom ? [m.bloom] : [])),
    moves,
    step: settle.step,
    inWindow: settle.inWindow,
    multiplier: settle.multiplier / 100,
    win: settle.win / 100,
  };
}
