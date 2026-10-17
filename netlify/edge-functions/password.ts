// Password gate for the hosted demo: every request needs the shared password (checked on Netlify's
// servers, so it can't be bypassed from the browser). The password is the SITE_PASSWORD environment
// variable in the Netlify project settings; there is no default, so until it's set the site stays shut.
// Change it there to lock everyone out and re-share, no code change needed. Entering it once sets a
// cookie for 30 days.

declare const Netlify: { env: { get(name: string): string | undefined } };

const COOKIE = 'edelweiss_pass';
const LOGIN = '/__password';
const DAYS = 30;

async function tokenFor(password: string) {
  const data = new TextEncoder().encode(`edelweiss-edge:${password}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cookieValue(req: Request, name: string) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/** Only redirect back to a path on this site. */
const safeNext = (next: unknown) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/');

export default async (req: Request, context: { next(): Promise<Response> }) => {
  const password = Netlify.env.get('SITE_PASSWORD');
  if (!password) return new Response('This demo is not open yet.', { status: 503, headers: { 'cache-control': 'no-store' } });
  const token = await tokenFor(password);
  const url = new URL(req.url);

  if (url.pathname === LOGIN && req.method === 'POST') {
    const form = await req.formData();
    const next = safeNext(form.get('next'));
    if ((await tokenFor(String(form.get('password') ?? ''))) === token) {
      return new Response(null, {
        status: 303,
        headers: {
          location: next,
          'set-cookie': `${COOKIE}=${token}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    return page(next, true);
  }

  if (cookieValue(req, COOKIE) === token) return context.next();
  return page(url.pathname === LOGIN ? '/' : url.pathname + url.search, false);
};

/** The password screen: plain until the art style is chosen. */
function page(next: string, wrong: boolean) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>Edelweiss Edge</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; font-family: system-ui, sans-serif; color: #f1faee; background: linear-gradient(#1d3557, #457b9d); }
  form { display: flex; flex-direction: column; align-items: center; gap: 12px; width: min(24em, 100%); }
  h1 { margin: 0; }
  .field { display: flex; gap: 8px; width: 100%; }
  input { flex: 1; min-width: 0; font: inherit; padding: 10px 12px; border-radius: 8px; border: 0; }
  button { font: inherit; font-weight: 700; padding: 10px 16px; border-radius: 8px; border: 0; background: #f4d35e; cursor: pointer; }
  p { margin: 0; min-height: 1.4em; }
</style></head>
<body>
  <form method="post" action="${LOGIN}">
    <h1>Edelweiss Edge</h1>
    <div class="field">
      <input type="password" name="password" placeholder="Password" aria-label="Password" autocomplete="current-password" autofocus required />
      <button type="submit">Enter</button>
    </div>
    <input type="hidden" name="next" value="${esc(next)}" />
    <p role="status">${wrong ? 'That password is not right. Try again.' : 'Enter the password to start the climb'}</p>
  </form>
</body></html>`;
  return new Response(html, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
