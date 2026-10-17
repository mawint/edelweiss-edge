import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { mockRgs } from './mock-rgs/plugin';

/** The Stake build's page: its real title, and none of the hosted demo's exported rounds. */
const stakePage: Plugin = {
  name: 'edelweiss-stake-page',
  transformIndexHtml: (html) => html.replace(/<title>[^<]*<\/title>/, '<title>Edelweiss Edge</title>'),
  // (on Stake the RGS deals every round)
  closeBundle() {
    const assets = path.resolve('dist-stake', 'assets');
    for (const f of fs.readdirSync(assets)) if (/^books-.*\.json$/.test(f)) fs.rmSync(path.join(assets, f));
  },
};

export default defineConfig(({ mode }) => ({
  // `npm run build:stake`: relative paths (Stake serves the game from /{game}/v{n}/), and the stake page
  ...(mode === 'stake' ? { base: './', build: { outDir: 'dist-stake' } } : {}),
  // JSON as named exports (not one stringified blob): the page imports only the export's numbers from
  // fixtures/books.json, and its books (fetched on their own, src/book.ts) are left out of the bundle
  json: { stringify: false },
  // a stand-in for Stake's RGS at /rgs on the dev server (mock-rgs/plugin.ts)
  plugins: [mockRgs(), ...(mode === 'stake' ? [stakePage] : [])],
  // (its own ports, so it runs alongside Sweet Push 5173, High Noon Push 5180 and Thunder Push 5190)
  server: {
    port: 5200,
    // let the dev server answer through an ngrok tunnel (Vite blocks unknown hostnames by default)
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io'],
  },
  preview: { port: 4200 },
}));
