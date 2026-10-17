// A stand-in for Stake Engine's RGS, answering the same requests the same way, from real books. It
// runs two ways: as a dev-server plugin over the math repo's full published books (mock-rgs/), and in
// the browser over fixtures/books.json when there's no server (the hosted demo). Stake has no mock
// server of its own, and its test servers need a team account.
//
// Like the real RGS, it picks each round by its lookup-table weight, takes the cost (bet × the mode's
// cost) up front, leaves a winning round open until end-round pays it, and closes a 0× round itself.
import { FIXTURES, kindOf, loadFixtureBooks, type BetMode, type Book, type FixtureBook } from './book';
import { MICRO, RgsError, type Authenticated, type BetConfig, type Money, type Rgs, type RgsRound } from './rgs';

export interface MockMode {
  cost: number;
  books: Book[];
  weights: number[]; // lookup-table weight of each book, same order
}
export type MockSource = Record<string, MockMode>;

interface Session {
  balance: number; // micro
  currency: string;
  round: RgsRound | null; // the open round (a winning one waiting for end-round)
  force?: string; // QA: the next round's kind
}
export type Reply = { status: number; body: unknown };

const ok = (body: unknown): Reply => ({ status: 200, body });
const refuse = (status: number, error: string, message: string): Reply => ({ status, body: { error, message } });

/** Bet levels in dollars, shaped like the range Stake tests USD with ($0.10 to $1,000, $1 default). */
const USD_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
/** Roughly what a dollar is worth in each currency the mock knows (bet levels scale by it). */
const PER_USD: Record<string, number> = { USD: 1, EUR: 1, CAD: 1, XSC: 1, XGC: 1, MXN: 20, JPY: 150 };

export function betConfig(currency: string): BetConfig {
  const rate = PER_USD[currency] ?? 1;
  const step = currency === 'JPY' ? MICRO : MICRO / 100; // (¥1, or a cent)
  const betLevels = USD_LEVELS.map((v) => Math.round((v * rate * MICRO) / step) * step);
  return {
    minBet: betLevels[0],
    maxBet: betLevels[betLevels.length - 1],
    stepBet: step,
    defaultBetLevel: betLevels[USD_LEVELS.indexOf(1)],
    betLevels,
    jurisdiction: { socialCasino: currency === 'XSC' || currency === 'XGC' },
  };
}

/** The fixture books as a source: each kind keeps its real share, split evenly over its books. */
export function fixtureSource(all: FixtureBook[]): MockSource {
  const source: MockSource = {};
  for (const [mode, { cost, kinds }] of Object.entries(FIXTURES.modes)) {
    const books = all.filter((b) => b.mode === mode && kinds[b.kind]);
    const perKind = (kind: string) => books.filter((b) => b.kind === kind).length;
    source[mode] = { cost, books, weights: books.map((b) => Math.round((kinds[b.kind] / perKind(b.kind)) * 1e12)) };
  }
  return source;
}

export class MockRgs {
  private sessions = new Map<string, Session>();
  private nextBet = 1;

  constructor(
    private source: MockSource,
    private opts: { rng?: () => number; balance?: number; currency?: string; persist?: (sessions: Record<string, Session>) => void; restore?: Record<string, Session> } = {},
  ) {
    for (const [id, s] of Object.entries(opts.restore ?? {})) this.sessions.set(id, s);
  }

  /** Its rounds, once they've arrived (the demo starts without them: see demoRgs). */
  setSource(source: MockSource) {
    this.source = source;
  }

  /** A POST to the wallet, /bet/event, or the mock's QA endpoints. */
  request(path: string, body: Record<string, unknown>): Reply {
    const id = String(body.sessionID ?? '');
    if (!id) return refuse(400, 'ERR_VAL', 'sessionID is missing');
    const s = this.sessions.get(id);
    if (!s && path !== '/wallet/authenticate') return refuse(400, 'ERR_VAL', 'unknown or unauthenticated session');
    const reply = s && path !== '/wallet/authenticate' ? this.route(path, s, body) : ok(this.authenticate(id));
    this.opts.persist?.(Object.fromEntries(this.sessions));
    return reply;
  }

  /** GET /bet/replay/{game}/{version}/{mode}/{event}: a recorded round (here: a book, by id). */
  replay(mode: string, event: string): Reply {
    const book = this.source[mode]?.books.find((b) => String(b.id) === event);
    if (!book) return refuse(404, 'ERR_VAL', `no round ${event} in mode ${mode}`);
    return ok({ payoutMultiplier: book.payoutMultiplier / 100, costMultiplier: this.source[mode].cost, state: book.events });
  }

  private authenticate(id: string): Authenticated {
    let s = this.sessions.get(id);
    if (!s) this.sessions.set(id, (s = { balance: this.opts.balance ?? 1000 * MICRO, currency: this.opts.currency ?? 'USD', round: null }));
    return { balance: this.money(s), config: betConfig(s.currency), round: s.round };
  }

  private route(path: string, s: Session, body: Record<string, unknown>): Reply {
    switch (path) {
      case '/wallet/balance':
        return ok({ balance: this.money(s) });
      case '/wallet/play':
        return this.play(s, Number(body.amount), String(body.mode));
      case '/wallet/end-round':
        if (!s.round) return refuse(400, 'ERR_VAL', 'no open round to end');
        s.balance += s.round.payout;
        s.round = null;
        return ok({ balance: this.money(s) });
      case '/bet/event':
        if (!s.round) return refuse(400, 'ERR_VAL', 'no open round');
        s.round.event = String(body.event);
        return ok({ event: s.round.event });
      case '/mock/force':
        s.force = String(body.kind);
        return ok({});
      case '/mock/session': // QA: set the balance (micro) or currency, e.g. to test insufficient balance or JPY
        if (body.currency !== undefined) {
          s.currency = String(body.currency);
          s.balance = 1000 * (PER_USD[s.currency] ?? 1) * MICRO; // (a fresh wallet worth about $1,000)
        }
        if (body.balance !== undefined) s.balance = Number(body.balance);
        return ok({ balance: this.money(s), config: betConfig(s.currency) });
      default:
        return refuse(404, 'ERR_VAL', `unknown endpoint ${path}`);
    }
  }

  private play(s: Session, amount: number, mode: string): Reply {
    const m = this.source[mode];
    if (!m) return refuse(400, 'ERR_VAL', `unknown mode ${mode}`);
    if (s.round) return refuse(400, 'ERR_VAL', 'a round is still open: end it first');
    if (!betConfig(s.currency).betLevels.includes(amount)) return refuse(400, 'ERR_VAL', `${amount} is not a bet level`);
    const cost = Math.round(amount * m.cost);
    if (cost > s.balance) return refuse(400, 'ERR_IPB', 'insufficient balance');
    const book = this.pick(m, mode as BetMode, s.force);
    s.force = undefined;
    const payout = Math.round((amount * book.payoutMultiplier) / 100);
    s.balance -= cost;
    const round: RgsRound = { betID: this.nextBet++, amount, payout, payoutMultiplier: book.payoutMultiplier / 100, costMultiplier: m.cost, active: payout > 0, mode, event: null, state: book.events };
    s.round = round.active ? round : null; // a 0× round is closed straight away
    return ok({ balance: this.money(s), round });
  }

  /**
   * A book by lookup-table weight; or, for QA, one of the forced kind. A forced kind picks evenly
   * among its rounds and never the one it gave last time, so QA sees different rounds of a kind
   * (by weight, one round usually won: e.g. the same climb every time).
   */
  private lastForced = new Map<string, number>();
  private pick(m: MockMode, mode: BetMode, kind?: string): Book {
    const rng = this.opts.rng ?? Math.random;
    if (kind) {
      const all = m.books.filter((b) => kindOf(b) === kind);
      const key = mode + ':' + kind;
      const fresh = all.length > 1 ? all.filter((b) => b.id !== this.lastForced.get(key)) : all;
      if (fresh.length) {
        const book = fresh[Math.floor(rng() * fresh.length)];
        this.lastForced.set(key, book.id);
        return book;
      }
    }
    // (a forced kind can pick a round the table never would, so QA can reach anything)
    const allowed = m.books.map((b, i) => (!kind ? m.weights[i] : kindOf(b) === kind ? m.weights[i] || 1 : 0));
    const total = allowed.reduce((a, b) => a + b, 0);
    if (total === 0) return this.pick(m, mode); // (the mode has no round of that kind)
    let r = rng() * total;
    for (let i = 0; i < m.books.length; i++) if ((r -= allowed[i]) < 0) return m.books[i];
    return m.books[m.books.length - 1];
  }

  private money(s: Session): Money {
    return { amount: s.balance, currency: s.currency };
  }
}

/**
 * The hosted demo's wallet: the mock in the page, up straight away, its rounds downloading in the
 * background (only a bet waits for them).
 */
export function demoRgs(opts: ConstructorParameters<typeof MockRgs>[1]): Rgs {
  const mock = new MockRgs({}, opts);
  const ready = loadFixtureBooks().then((books) => mock.setSource(fixtureSource(books)));
  ready.catch(() => {}); // (a failed download surfaces on the bet that needs it)
  return inPageRgs(mock, 'demo', ready);
}

/** The mock as an Rgs the game can call directly, with no server (the hosted demo). */
export function inPageRgs(mock: MockRgs, sessionID: string, booksReady?: Promise<unknown>): Rgs {
  const post = async <T>(path: string, body: object = {}): Promise<T> => {
    if (path === '/wallet/play') await booksReady; // (a bet needs the rounds; signing in and the balance don't)
    const { status, body: reply } = mock.request(path, { sessionID, ...body });
    if (status !== 200) {
      const { error, message } = reply as { error: string; message: string };
      throw new RgsError(error, message, status);
    }
    return reply as T;
  };
  return {
    authenticate: () => post('/wallet/authenticate'),
    balance: () => post('/wallet/balance'),
    play: (amount, mode) => post('/wallet/play', { amount, mode }),
    endRound: () => post('/wallet/end-round'),
    event: (event) => post('/bet/event', { event }),
    force: (kind) => post('/mock/force', { kind }),
    qaSession: (changes) => post('/mock/session', changes),
  };
}
