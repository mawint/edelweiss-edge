import { describe, expect, it } from 'vitest';
import data from '../fixtures/books.json';
import { kindOf, type FixtureBook } from './book';
import { MICRO, formatMoney, readLaunch, rgsBase, type RgsRound } from './rgs';
import { MockRgs, betConfig, fixtureSource } from './rgs-mock';

// (the exported books, read straight from the file: the page fetches them on their own)
const BOOKS = data.books as unknown as FixtureBook[];

describe('launch URL', () => {
  it('adds the scheme rgs_url needs, and never doubles one', () => {
    expect(rgsBase('rgs.example.com')).toBe('https://rgs.example.com');
    expect(rgsBase('https://rgs.example.com/')).toBe('https://rgs.example.com');
    expect(rgsBase('localhost:5173/rgs')).toBe('http://localhost:5173/rgs');
  });

  it('reads every parameter, tablets included, with English and USD when missing', () => {
    const l = readLaunch('?sessionID=abc&rgs_url=rgs.example.com&device=tablet&social=true&currency=xsc');
    expect(l).toMatchObject({ sessionID: 'abc', rgsUrl: 'https://rgs.example.com', device: 'tablet', social: true, currency: 'XSC', lang: 'en', replay: null });
    expect(readLaunch('?replay=true&game=g&version=3&mode=rush&event=42&amount=5000000').replay).toEqual({ game: 'g', version: '3', mode: 'rush', event: '42', amount: 5000000 });
    // a replay with no (or a broken) amount is shown at 1; a social one with no currency in SC
    expect(readLaunch('?replay=true&amount=abc').replay?.amount).toBeNull();
    expect(readLaunch('?replay=true&social=true').currency).toBe('XSC');
  });
});

describe('money', () => {
  it('shows each currency the way the platform does', () => {
    expect(formatMoney(10, 'USD')).toBe('$10.00');
    expect(formatMoney(10, 'CAD')).toBe('CA$10.00');
    expect(formatMoney(10, 'JPY')).toBe('¥10');
    expect(formatMoney(10, 'XSC')).toBe('10.00 SC');
    expect(formatMoney(10, 'XGC')).toBe('10.00 GC');
  });

  it('keeps the digits a sub-cent payout needs', () => {
    expect(formatMoney(0.005, 'USD')).toBe('$0.005');
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
  });
});

describe('mock RGS replays', () => {
  it('serves a recorded round by id, with its payout and cost', () => {
    const book = BOOKS.find((b) => b.mode === 'edge' && b.kind === 'win')!;
    const { status, body } = new MockRgs(fixtureSource(BOOKS)).replay('edge', String(book.id));
    expect(status).toBe(200);
    expect(body).toMatchObject({ payoutMultiplier: book.payoutMultiplier / 100, costMultiplier: 1, state: book.events });
    expect(new MockRgs(fixtureSource(BOOKS)).replay('edge', '99999999').status).toBe(404);
  });
});

describe('mock RGS', () => {
  const session = () => {
    const rgs = new MockRgs(fixtureSource(BOOKS), { rng: () => 0.5 });
    const call = (path: string, body: object = {}) => rgs.request(path, { sessionID: 's', ...body });
    call('/wallet/authenticate');
    return { rgs, call };
  };
  const play = (call: ReturnType<typeof session>['call'], mode = 'easy_10', amount = MICRO) => call('/wallet/play', { amount, mode });

  it("takes the mode's cost up front and pays a winning round only at end-round", () => {
    const { call } = session();
    call('/mock/force', { kind: 'win' });
    const { body } = play(call, 'pinpoint_13') as { body: { balance: { amount: number }; round: RgsRound } };
    expect(body.balance.amount).toBe(1000 * MICRO - MICRO);
    expect(body.round.active).toBe(true);
    expect(play(call).status).toBe(400); // (one round at a time)
    const end = call('/wallet/end-round').body as { balance: { amount: number } };
    expect(end.balance.amount).toBe(1000 * MICRO - MICRO + body.round.payout);
  });

  it('closes a 0× round itself, so end-round is refused', () => {
    const { call } = session();
    call('/mock/force', { kind: 'loss' });
    const { body } = play(call) as { body: { round: RgsRound } };
    expect(body.round).toMatchObject({ payout: 0, active: false });
    expect(call('/wallet/end-round')).toMatchObject({ status: 400, body: { error: 'ERR_VAL' } });
  });

  it('refuses a bet the balance cannot cover, or one that is not a bet level', () => {
    const { call } = session();
    call('/mock/session', { balance: 0.5 * MICRO });
    expect(play(call)).toMatchObject({ status: 400, body: { error: 'ERR_IPB' } });
    call('/mock/session', { balance: 10 * MICRO });
    expect(play(call, 'easy_10', 1234)).toMatchObject({ status: 400, body: { error: 'ERR_VAL' } });
    expect(play(call, 'pinpoint_26')).toMatchObject({ status: 400, body: { error: 'ERR_VAL' } }); // (no such mode)
  });

  it('keeps progress saved with /bet/event in the open round', () => {
    const { call } = session();
    call('/mock/force', { kind: 'win' });
    play(call);
    call('/bet/event', { event: '{"climb":2}' });
    expect((call('/wallet/authenticate').body as { round: RgsRound }).round.event).toBe('{"climb":2}');
  });

  it('pays exactly what the book says', () => {
    const { call } = session();
    for (const mode of ['easy_10', 'medium_0', 'hard_23', 'pinpoint_1', 'edge']) {
      call('/mock/force', { kind: 'win' });
      const { round } = play(call, mode).body as { round: RgsRound };
      const final = round.state.at(-1)!;
      expect(final.type === 'finalWin' && final.amount * (MICRO / 100)).toBe(round.payout);
      call('/wallet/end-round');
    }
  });

  it('offers USD bets from $0.10 to $1,000, $1 by default, and JPY in whole yen', () => {
    const usd = betConfig('USD');
    expect([usd.minBet, usd.maxBet, usd.defaultBetLevel].map((v) => v / MICRO)).toEqual([0.1, 1000, 1]);
    expect(betConfig('JPY').betLevels.every((v) => v % MICRO === 0)).toBe(true);
  });
});

it('classifies every fixture the way the math export did', () => {
  for (const book of BOOKS) expect(kindOf(book)).toBe(book.kind);
});
