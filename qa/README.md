# QA harness

Automated checks for Edelweiss Edge. It drives headless Chrome over the DevTools protocol and only uses the `window.game` hooks (`src/main.ts`). Nothing here ships.

Needs Node 22+ (built-in `fetch` and `WebSocket`) and Google Chrome. Set `CHROME_PATH` if Chrome isn't in the default place.

## Layout

```
qa/
  build-ref.mjs   build any git ref into qa/builds/<name> (temporary worktree, your checkout untouched)
  probes/         targeted checks, one scenario each
  lib/            headless Chrome client, static server
  results/        output (gitignored)
  builds/         builds to test (gitignored)
```

Test production builds when comparing two versions (Vite's hot reload restarts the page mid-run):

```bash
npm run qa:build-ref -- main
npm run qa:serve -- qa/builds/main 4301 &
node qa/probes/rounds.mjs --url http://127.0.0.1:4301/
```

## Probes

All take `--url` (default `http://localhost:5200/`, the dev server).

| probe | checks |
| --- | --- |
| `probes/rounds.mjs [--modes easy_10,pinpoint_13,edge] [--n 4]` | plays rounds in each mode: each is staged to its end and the balance moves by exactly the payout less the bet (exits 1 on a failure) |
| `probes/screenshot.mjs [--size 390x844] [--out qa/results/screenshot.png] [--playing]` | a phone screenshot, and whether the page scrolls sideways |
| `probes/frames.mjs [--size 1280x720] [--mode medium_11] [--every 2500] [--n 8]` | screenshots of one animated round at intervals |
| `probes/perf.mjs [--size 390x844] [--dpr 3] [--cpu 4] [--mode medium_11] [--idle]` | frame timing on a throttled phone over a fixed round (or the idle overview): fps, render ms, time per draw step and canvas calls per frame. Headless Chrome doesn't raster like a phone GPU, so read the canvas calls as the GPU's load and compare runs, not machines |

The regression runner, metrics and physics harness of the coin pushers (`run.mjs`, `metrics.mjs`, `harness/`) were left out: they measure coins and cards. Add a runner like them when the climb has real staging worth comparing between builds.
