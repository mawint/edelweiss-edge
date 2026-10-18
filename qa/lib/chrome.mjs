// Headless Chrome driven over the DevTools protocol: one page, a fresh profile per run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32') return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return 'google-chrome';
}

/**
 * Launch headless Chrome and connect to its page.
 * `init` is a script run in every new document before the game's own code (seed the wallet, etc.).
 */
export async function openPage({ width = 1280, height = 720, dpr = 1, mobile = false, touch = false, init = '' } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edelweiss-qa-'));
  const chrome = spawn(
    chromePath(),
    [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
      // a page that isn't on screen must still run at full speed
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--mute-audio', 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  // Chrome picks a free port and writes it to the profile
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try {
      port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
    } catch {
      await sleep(100);
    }
  }
  if (!port) throw new Error(`Chrome didn't start (${chromePath()}); set CHROME_PATH`);
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      await sleep(100);
    }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  /** Evaluate an expression in the page (awaiting promises). Throws on a page exception. */
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const ex = r.result?.exceptionDetails;
    if (ex) throw new Error(ex.exception?.description ?? ex.text ?? 'page exception');
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // page errors are collected for the run report
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__qaErrors = []; addEventListener('error', (e) => __qaErrors.push(String(e.message)));
      addEventListener('unhandledrejection', (e) => __qaErrors.push('rejection: ' + String(e.reason)));\n${init}`,
  });

  return {
    send,
    ev,
    /** Load the game and wait until it has signed in to the RGS (`game.state.ready`). */
    async openGame(url, timeoutS = 60) {
      await send('Page.navigate', { url });
      for (let i = 0; i < timeoutS; i++) {
        // (ready, then past the title screen's Play, which a probe has no reason to look at)
        if ((await ev('!!(window.game && game.state.ready)').catch(() => false)) === true) { await ev('game.enter()').catch(() => {}); await sleep(500); return; }
        await sleep(1000);
      }
      throw new Error(`the game didn't load from ${url} in ${timeoutS}s`);
    },
    /** Slow the CPU down (4 = four times slower), to stand in for a low-end phone. */
    throttleCpu: (rate) => send('Emulation.setCPUThrottlingRate', { rate }),
    async screenshot(file, clip) {
      const r = await send('Page.captureScreenshot', { format: file.endsWith('.jpg') ? 'jpeg' : 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    close() {
      ws.close();
      chrome.kill();
      setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
    },
  };
}

/** `--key value` / `--flag` arguments, with defaults. */
export function parseArgs(defaults = {}) {
  const out = { ...defaults };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export const size = (s) => s.split('x').map(Number);
export { sleep };
