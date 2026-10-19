# Edelweiss Edge

An alpine climbing game for Stake Engine. It was set up from Thunder Push's repos (DanBergDesign/thunder-push and thunder-push-math), keeping their engine plumbing: the RGS client, mock RGS, fixtures, QA harness and Stake build.

Before starting work, find out where things stand:

- **Status (done, next, open questions):** `docs/STATUS.md`. Read it first, and update it when work lands.
- **The design:** `docs/GAME_DESIGN.md` covers the climb, the bets, features, blooms, bet modes and book events. The same file is in the math repo; change both together.
- **How rounds work:** the math decides every round up front (a "book"). The game only stages it and pays the book's total. The math lives in mawint/edelweiss-edge-math (`games/edelweiss_edge/`). For background on the engine, see Thunder Push's `docs/from-sweet-push/`.
- **Before submitting:** run `engine-review-prompt.md` against the game.

## The game in brief
- **The ridge:** Ueli climbs from step 0 (base camp, 2,200 m) to step 25 (the top station, 3,000 m), 32 m a step. Past step 25 he goes over the edge.
- **Decided first, acted out second:** where he stops is drawn from fixed weights out of 100,000. Step k weighs 7134 − 264k, and over the edge weighs 316 (0.316%). The higher the step, the rarer.
- **The story:** three climbs of 0-9 steps ("Climb 1 of 3"; 0 means he stops to yodel). Features: Gondola Lift +2-4 (1 in 9), Avalanche -2-5 when above step 6 (1 in 10), Alphorn Echo repeats the last climb (1 in 14), Föhn Wind ±1-3 at the end (1 in 7). Features never change the odds.
- **Barry's Rescue:** 79 of step 25's 534 are told as a fall and a rescue (1 in 5 falls shown). Over the Edge wins only on a real fall.
- **The bet:** pick a difficulty for the window's width: Easy 8 steps, Medium 5, Hard 3, Pinpoint 1. Then slide the window anywhere on steps 0-25. Pay = RTP / (P(window) × 1.278125), quoted down to 0.10×, so pay rises toward the edge (Easy 1.5×-6.4×, Pinpoint 10.5×-141.3×). **Over the Edge** pays 238.9×. Every placement is offered.
- **Edelweiss:** independent of the stop, hidden until reached and always collected. 1/6 of rounds have one bloom and 1/6 two, each +0.5×. A Golden Edelweiss (1 in 400) is ×10. E[multiplier] = 1.278125.
- **Bet modes:** one per (difficulty, start step), plus `edge`: 92 in all. All at 96.5% RTP with a 5,000× max win.
- **Book events:** `reveal`, `climb`, `feature`, `bloom`, `fall`, `settle`, then the SDK's `wincap`/`finalWin`.

## Commands
- `npm run dev`: the game on port 5200, plus a mock Stake RGS at `/rgs`. It serves `../edelweiss-edge-math` books if present, else `fixtures/books.json`.
- `npm test`: the fixtures against the design, the RGS client and mock, and social wording.
- `npm run build:stake`: the Stake upload (`dist-stake/`).
- `node qa/probes/<probe>.mjs`: QA probes (see `qa/README.md`).

## Rules of thumb
- The publisher is **Copperwick Studios** (`PUBLISHER` in `src/rules.ts`, used in the rules' "TM and ©" line, as in Thunder Push).
- Never add money logic to the client: payouts come from book events (`src/book.ts`).
- Player-facing text with bet/buy/pay words needs a social-casino version (`data-social` in `index.html`, `say()` in `src/main.ts`). `src/wording.test.ts` enforces it.
- The screen: `src/scene.ts` draws the mountain on a canvas (alpine cartoon) and only animates what it's told; `src/director.ts` turns a book into scene beats; `src/sound.ts` synthesizes every sound behind one mute. Cosmetic randomness (weather, teases) is seeded from the book id so replays match. The rules screen is `src/rules.ts`, built from the exported numbers; its phrases go through `w(normal, social)`.
- Fonts are bundled from `@fontsource` (no Google Fonts: the Stake build may not load external hosts).
- `node qa/probes/frames.mjs` screenshots an animated round at intervals; the browser pane pauses animation when hidden.
- `src/scene.ts` draws every frame: keep per-frame work batched and allocation-free (static art goes in the rock layer or a sprite), and check `node qa/probes/perf.mjs` canvas calls before and after.
- Saved data uses `edelweiss.*` keys, never another game's (all the games run on localhost).
- Ports: 5200 dev, 4200 preview, 4201 Stake preview.
- Both repos are public: never commit secrets.
- Commit and push only when asked.
