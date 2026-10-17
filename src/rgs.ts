// Talks to Stake Engine's Remote Game Server (RGS): the wallet (authenticate, play, end-round,
// balance), progress saved inside a round (/bet/event) and replays. Modelled on Stake's ts-client
// (github.com/StakeEngine/ts-client) but written for this game, because ts-client fails parts of the
// approval checklist (engine-review-prompt.md): it throws on device=tablet, doubles a scheme already
// in rgs_url, loses the error code, shows Gold Coins without decimals, and has no replay.
//
// Money crosses the wire in micro-units: 1_000_000 = 1.00 of the currency.
import type { BookEvent } from './book';

export const MICRO = 1_000_000;

/** What the game was launched with (Stake puts it all in the URL). */
export interface Launch {
  sessionID: string | null;
  /** The RGS base URL, scheme included. Null when the URL didn't give one. */
  rgsUrl: string | null;
  lang: string;
  currency: string;
  device: 'desktop' | 'mobile' | 'tablet';
  social: boolean;
  demo: boolean;
  /** A replay link: play this one recorded round, with no session and no wallet. */
  replay: { game: string; version: string; mode: string; event: string; amount: number | null } | null;
}

/** `rgs_url` may come as a bare host; add the scheme it needs (plain http only for a local mock). */
export function rgsBase(rgsUrl: string): string {
  const url = rgsUrl.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(url)) return url;
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.localhost)(:\d+)?(\/|$)/i.test(url);
  return `${local ? 'http' : 'https'}://${url}`;
}

export function readLaunch(search: string): Launch {
  const p = new URLSearchParams(search);
  const device = p.get('device');
  const amount = Number(p.get('amount'));
  const replay = p.get('replay') === 'true';
  return {
    sessionID: p.get('sessionID'),
    rgsUrl: p.get('rgs_url') ? rgsBase(p.get('rgs_url')!) : null,
    lang: p.get('lang') || 'en',
    currency: (p.get('currency') || (p.get('social') === 'true' ? 'XSC' : 'USD')).toUpperCase(), // (a social replay with no currency shows SC)
    device: device === 'mobile' || device === 'tablet' ? device : 'desktop',
    social: p.get('social') === 'true',
    demo: p.get('demo') === 'true',
    replay: replay
      ? { game: p.get('game') ?? '', version: p.get('version') ?? '', mode: p.get('mode') ?? '', event: p.get('event') ?? '', amount: amount > 0 ? amount : null }
      : null,
  };
}

// ---------- the wallet API ----------

export interface Money {
  amount: number; // micro-units
  currency: string;
}
export interface BetConfig {
  minBet: number;
  maxBet: number;
  stepBet: number;
  defaultBetLevel: number;
  betLevels: number[]; // micro-units, ascending
  jurisdiction?: { socialCasino?: boolean; disabledTurbo?: boolean; disabledAutoplay?: boolean; disabledBuyFeature?: boolean; disabledSpacebar?: boolean };
}
/** A round as the RGS returns it: `state` is the book's events, `event` the progress saved with /bet/event. */
export interface RgsRound {
  betID: number;
  amount: number; // the base bet (micro)
  payout: number; // micro
  payoutMultiplier: number; // × the base bet
  costMultiplier?: number;
  active: boolean; // still open: it paid more than 0 and end-round hasn't been sent
  mode: string;
  event?: string | null;
  state: BookEvent[];
}
export interface Authenticated {
  balance: Money;
  config: BetConfig;
  round: RgsRound | null;
}

/** An RGS refusal, with its code: ERR_IPB (insufficient balance), ERR_VAL (bad request or session), ERR_GLE (gambling limits), ERR_ACT (try again shortly), ERR_GEN, or ERR_NETWORK when it couldn't be reached. */
export class RgsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export interface Rgs {
  authenticate(): Promise<Authenticated>;
  balance(): Promise<{ balance: Money }>;
  play(amount: number, mode: string): Promise<{ balance: Money; round: RgsRound }>;
  endRound(): Promise<{ balance: Money }>;
  /** Save progress inside the open round (a refresh resumes from it). */
  event(value: string): Promise<{ event: string }>;
  /** QA on a mock RGS only (Stake's RGS can't do these): the next round is this kind... */
  force?(kind: string): Promise<void>;
  /** ...or the session's balance (micro) or currency changes. */
  qaSession?(changes: { balance?: number; currency?: string }): Promise<{ balance: Money; config: BetConfig }>;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new RgsError('ERR_NETWORK', 'Could not reach the game server');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RgsError(data.error ?? 'ERR_GEN', data.message ?? `The game server answered ${response.status}`, response.status);
  return data as T;
}

/** The RGS at `base` (see rgsBase), for session `sessionID`. */
export function httpRgs(base: string, sessionID: string): Rgs {
  const post = <T>(path: string, body: object = {}) =>
    call<T>(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionID, ...body }) });
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

/** A recorded round for a replay link. It needs no session: replays make no wallet calls. */
export function fetchReplay(base: string, r: NonNullable<Launch['replay']>) {
  const path = [r.game, r.version, r.mode, r.event].map(encodeURIComponent).join('/');
  return call<{ payoutMultiplier: number; costMultiplier: number; state: BookEvent[] }>(`${base}/bet/replay/${path}`);
}

// ---------- showing money ----------

/** How each currency is shown: its symbol, decimals, and whether the symbol goes after the number. */
const CURRENCIES: Record<string, { symbol: string; decimals: number; after?: boolean }> = {
  USD: { symbol: '$', decimals: 2 },
  CAD: { symbol: 'CA$', decimals: 2 },
  EUR: { symbol: '€', decimals: 2 },
  MXN: { symbol: 'MX$', decimals: 2 },
  JPY: { symbol: '¥', decimals: 0 },
  BRL: { symbol: 'R$', decimals: 2 },
  INR: { symbol: '₹', decimals: 2 },
  IDR: { symbol: 'Rp', decimals: 0 },
  KRW: { symbol: '₩', decimals: 0 },
  CNY: { symbol: 'CN¥', decimals: 2 },
  PHP: { symbol: '₱', decimals: 2 },
  RUB: { symbol: '₽', decimals: 2 },
  TRY: { symbol: '₺', decimals: 2 },
  TWD: { symbol: 'NT$', decimals: 2 },
  SGD: { symbol: 'SG$', decimals: 2 },
  PLN: { symbol: 'zł', decimals: 2, after: true },
  DKK: { symbol: 'KR', decimals: 2, after: true },
  VND: { symbol: '₫', decimals: 0, after: true },
  XSC: { symbol: 'SC', decimals: 2, after: true }, // Stake.US Stake Cash
  XGC: { symbol: 'GC', decimals: 2, after: true }, // Stake.US Gold Coins
  XEC: { symbol: 'SC', decimals: 2, after: true },
};

/** How many decimals a currency is normally shown with (¥ none, $ two). */
export const currencyDecimals = (currency: string) => (CURRENCIES[currency] ?? { decimals: 2 }).decimals;

/**
 * `value` (in units of the currency, not micro) as the player sees it: "$1.20", "¥150", "10.00 SC".
 * A value finer than the currency's usual decimals keeps the digits it needs (a 0.10× win on a
 * 0.05 bet shows $0.005, not $0.01), since what's shown must match what the RGS pays.
 */
export function formatMoney(value: number, currency: string, withSymbol = true): string {
  const c = CURRENCIES[currency] ?? { symbol: currency, decimals: 2, after: true };
  let decimals = c.decimals;
  while (decimals < 6 && Math.abs(Math.round(value * 10 ** decimals) - value * 10 ** decimals) > 1e-6) decimals++;
  const n = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (!withSymbol) return n;
  return c.after ? `${n} ${c.symbol}` : `${value < 0 ? '-' : ''}${c.symbol}${n.replace('-', '')}`;
}
