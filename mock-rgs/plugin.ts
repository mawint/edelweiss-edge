// The mock RGS on the dev server (`npm run dev`), at /rgs. It serves the math repo's full published
// books, so local play uses the real distribution; without them it falls back to the fixtures.
//   EDELWEISS_MATH=/path/to/publish_files   (default: ../edelweiss-edge-math/games/edelweiss_edge/library/publish_files)
// Open the game with ?sessionID=…&rgs_url=localhost:5173/rgs (the game does this itself in dev).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { Book, FixtureBook } from '../src/book';
import { MockRgs, fixtureSource, type MockSource } from '../src/rgs-mock';

/** Most of a mode's books (decompressed) the dev server keeps in memory: past it, an evenly spaced sample. */
const MAX_BYTES = 120e6;

/**
 * One mode's books and lookup table, as the math publishes them (index.json names the files). Read line by
 * line (a bought bonus's books run to a gigabyte: more than one string can hold); a mode bigger than MAX_BYTES
 * keeps every k-th book, which is still its distribution, by weight.
 */
function readMode(dir: string, entry: { name: string; cost: number; events: string; weights: string }) {
  const raw = zlib.zstdDecompressSync(fs.readFileSync(path.join(dir, entry.events)));
  const every = Math.max(1, Math.ceil(raw.length / MAX_BYTES));
  const books: Book[] = [];
  for (let at = 0, n = 0; at < raw.length; n++) {
    let end = raw.indexOf(10, at);
    if (end < 0) end = raw.length;
    if (end > at && n % every === 0) books.push(JSON.parse(raw.toString('utf8', at, end)) as Book);
    at = end + 1;
  }
  const weights = new Map<number, number>();
  for (const row of fs.readFileSync(path.join(dir, entry.weights), 'utf8').split('\n').filter(Boolean)) {
    const [id, weight] = row.split(',').map(Number);
    weights.set(id, weight);
  }
  return { cost: entry.cost, books, weights: books.map((b) => weights.get(b.id) ?? 0) };
}

function loadSource(root: string, log: (msg: string) => void): MockSource {
  const dir = process.env.EDELWEISS_MATH ?? path.resolve(root, '../edelweiss-edge-math/games/edelweiss_edge/library/publish_files');
  const index = path.join(dir, 'index.json');
  // (tests run a Vite server too: they play the fixtures, never a gigabyte of books)
  if (!fs.existsSync(index) || process.env.VITEST) {
    log(`mock RGS: no math books at ${dir}, playing fixtures/books.json (set EDELWEISS_MATH, or run the math's run.py)`);
    const { books } = JSON.parse(fs.readFileSync(path.resolve('fixtures/books.json'), 'utf8')) as { books: FixtureBook[] };
    return fixtureSource(books);
  }
  const { modes } = JSON.parse(fs.readFileSync(index, 'utf8')) as { modes: { name: string; cost: number; events: string; weights: string }[] };
  const source = Object.fromEntries(modes.map((m) => [m.name, readMode(dir, m)]));
  log(`mock RGS: ${modes.map((m) => `${m.name} ${source[m.name].books.length} rounds`).join(', ')} from ${dir}`);
  return source;
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function mockRgs(): Plugin {
  return {
    name: 'edelweiss-mock-rgs',
    apply: 'serve',
    configureServer(server) {
      // (Vite restarts the server when the books or the mock's own code change: the wallets are kept in
      // the process, so a page that's open keeps its session and balance across the restart)
      const kept = globalThis as { __edelweissMockSessions?: Record<string, never> };
      const rgs = new MockRgs(loadSource(server.config.root, (msg) => server.config.logger.info(msg)), {
        restore: kept.__edelweissMockSessions,
        persist: (sessions) => (kept.__edelweissMockSessions = sessions as Record<string, never>),
      });
      server.middlewares.use('/rgs', async (req, res) => {
        // (a game on another origin may call it, as the real RGS allows)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return send(res, 204, {});
        const url = req.url ?? '';
        const replay = url.match(/^\/bet\/replay\/[^/]+\/[^/]+\/([^/]+)\/([^/?]+)/);
        if (req.method === 'GET' && replay) {
          const { status, body } = rgs.replay(decodeURIComponent(replay[1]), decodeURIComponent(replay[2]));
          return send(res, status, body);
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'ERR_VAL', message: 'POST only' });
        const { status, body } = rgs.request(url.split('?')[0], await readBody(req));
        send(res, status, body);
      });
    },
  };
}
