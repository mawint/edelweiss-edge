// Build any git ref (branch, tag, commit) into qa/builds/<name>, without touching your working tree.
// node qa/build-ref.mjs <ref> [name]      e.g. node qa/build-ref.mjs main
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [ref, nameArg] = process.argv.slice(2);
if (!ref) {
  console.error('usage: node qa/build-ref.mjs <ref> [name]');
  process.exit(1);
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = nameArg ?? ref.replace(/[^\w.-]+/g, '-');
const out = path.join(repo, 'qa', 'builds', name);
const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'edelweiss-ref-'));
const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'inherit' });
try {
  git('worktree', 'add', '--detach', tree, ref);
  // (reuse this checkout's node_modules: same package-lock for the refs we compare)
  // ('junction': on Windows a plain directory symlink needs admin rights; elsewhere the type is ignored)
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(tree, 'node_modules'), 'junction');
  // (vite's own script run by this node, not `npx`: Windows can't run npx.cmd without a shell)
  const vite = path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
  execFileSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], { cwd: tree, stdio: 'inherit' });
  console.log(`built ${ref} -> ${path.relative(repo, out)}`);
} finally {
  // (drop the link first, so removing the worktree can never reach through it into the real node_modules)
  try {
    fs.unlinkSync(path.join(tree, 'node_modules'));
  } catch {}
  git('worktree', 'remove', '--force', tree);
}
