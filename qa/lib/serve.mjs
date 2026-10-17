// Static server for a production build (localhost only).
// node qa/lib/serve.mjs <dir> <port>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

export function serve(dir, port) {
  const root = path.resolve(dir) + path.sep;
  return http
    .createServer((req, res) => {
      const rel = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      let file = path.join(root, rel);
      // (anything outside the build, or not a file, gets the app shell)
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(port, '127.0.0.1');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, port] = process.argv.slice(2);
  if (!dir || !port) {
    console.error('usage: node qa/lib/serve.mjs <dir> <port>');
    process.exit(1);
  }
  serve(dir, +port);
  console.log(`serving ${dir} on http://127.0.0.1:${port}/`);
}
