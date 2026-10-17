// The fixtures must be what the game can stage: every book adds up, and the modes are the design's.
import { describe, expect, it } from 'vitest';
import data from '../fixtures/books.json';
import { BET_MODES, DIFFICULTIES, FIXTURES, TOP, modeFor, planRound, startsFor, type FixtureBook } from './book';

const BOOKS = data.books as unknown as FixtureBook[];

describe('bet modes', () => {
  it('offers each difficulty wherever its window fits, and Over the Edge', () => {
    expect(DIFFICULTIES.map((d) => startsFor(d).length)).toEqual([19, 22, 24, 26]);
    expect(modeFor('pinpoint', 0)).toBe('pinpoint_0');
    expect(BET_MODES).toContain('edge');
    expect(BET_MODES).toHaveLength(92);
  });

  it('pays more the higher the window, and most for Over the Edge', () => {
    for (const d of DIFFICULTIES) {
      const pays = startsFor(d).map((from) => FIXTURES.modes[modeFor(d, from)!].pay);
      expect(pays.every((p, i) => i === 0 || p >= pays[i - 1])).toBe(true);
      expect(pays[pays.length - 1]).toBeGreaterThan(pays[0]);
      expect(FIXTURES.modes.edge.pay).toBeGreaterThan(pays[pays.length - 1]);
    }
  });

  it('draws the stop from weights out of 100,000', () => {
    const w = FIXTURES.rules.stopWeights;
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100_000);
    expect([w['0'], w['25'], w.edge]).toEqual([7134, 534, 316]);
  });
});

describe('fixture books', () => {
  it('has a loss and a win for every mode', () => {
    for (const mode of BET_MODES) {
      const kinds = new Set(BOOKS.filter((b) => b.mode === mode).map((b) => b.kind));
      expect([mode, ...kinds].sort()).toEqual([mode, 'loss', 'win'].sort());
    }
  });

  it('stages every book: moves chain, it ends where settle says, and it pays its book', () => {
    for (const book of BOOKS) {
      const plan = planRound(book);
      const mode = FIXTURES.modes[book.mode];
      expect(plan.pay).toBe(mode.pay);
      expect(plan.moves.filter((m) => m.label.startsWith('Climb')).length).toBe(3);
      const last = plan.moves[plan.moves.length - 1];
      expect(last.to).toBe(plan.step);
      // blooms only on steps he has reached by then
      let high = 0;
      for (const m of plan.moves) {
        if (m.bloom) expect(m.bloom.step).toBeLessThanOrEqual(high);
        high = Math.max(high, Math.min(m.to, TOP));
      }
      const won = mode.window === 'edge' ? plan.step > TOP : plan.step >= mode.window[0] && plan.step <= mode.window[1];
      expect(plan.inWindow).toBe(won);
      expect(plan.win).toBe(won ? Math.min(Math.floor(Math.round(mode.pay * plan.multiplier * 100) / 10) / 10, mode.maxWin) : 0);
      expect(book.events.at(-1)).toMatchObject({ type: 'finalWin', amount: book.payoutMultiplier });
    }
  });
});
