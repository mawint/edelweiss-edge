// Stake.US is a social casino: with social=true, no player-facing text may use these words (whole
// words, any case). Static text in index.html carries its social wording in data-social /
// data-social-label; text built in main.ts goes through say(normal, social). These tests keep both
// honest, so a new string can't slip a "bet" or "buy" past the social switch.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rulesHtml } from './rules';

const RESTRICTED =
  /\b(bets?|betting|buy|buying|bought|bonus buy|buy bonus|cash|credit|currency|deposit|fund|gamble|gambling|money|paid|paid out|pay|payer|pays|payout|paytable|pay table|purchase|rebet|stake|wager|withdraw|total bet|win feature|cost of|at the cost of)\b/i;

const html = fs.readFileSync('index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const main = fs.readFileSync('src/main.ts', 'utf8');

describe('social-casino wording', () => {
  it('gives every restricted word in index.html a social version on the same element', () => {
    const missing: string[] = [];
    // an element's own text: "<tag attrs>text<"
    for (const [, attrs, text] of html.matchAll(/<(\w[^>]*)>([^<]+)</g)) {
      if (RESTRICTED.test(text) && !/\bdata-social="/.test(attrs)) missing.push(text.trim());
    }
    for (const [tag] of html.matchAll(/<\w[^>]*aria-label="[^"]*"[^>]*>/g)) {
      const label = tag.match(/aria-label="([^"]*)"/)![1];
      if (RESTRICTED.test(label) && !/data-social-label="/.test(tag)) missing.push(label);
    }
    expect(missing).toEqual([]);
  });

  it('never uses a restricted word in a social version', () => {
    const social = [...html.matchAll(/data-social(?:-label)?="([^"]*)"/g)].map((m) => m[1]);
    // say('normal', 'social') / say(`normal`, `social`): the second argument
    const said = [...main.matchAll(/say\(\s*(['`])(?:(?!\1)[^\\]|\\.)*\1\s*,\s*(['`])((?:(?!\2)[^\\]|\\.)*)\2\s*\)/g)].map((m) => m[3]);
    expect(said.length).toBeGreaterThan(2);
    expect([...social, ...said].filter((t) => RESTRICTED.test(t.replace(/\$\{[^}]*\}/g, '')))).toEqual([]);
  });

  it('keeps the rules screen free of restricted words in its social version', () => {
    const text = rulesHtml(true).replace(/<[^>]+>/g, ' ');
    expect(text.match(new RegExp(RESTRICTED.source, 'gi')) ?? []).toEqual([]);
    // (the normal version does use them, so the switch is really doing something)
    expect(RESTRICTED.test(rulesHtml(false).replace(/<[^>]+>/g, ' '))).toBe(true);
  });

  it('states the RTP, the maximum win, every mode, the controls and the disclaimer', () => {
    const text = rulesHtml(false);
    for (const want of ['RTP: 96.50% in every mode', 'Maximum win: 5,000×', 'Easy', 'Medium', 'Hard', 'Pinpoint', 'Over the Edge', 'Menu (☰)', 'Turbo', 'Sound', 'Malfunction voids all wins and plays']) {
      expect(text).toContain(want);
    }
  });
});
