# Status

Last updated October 17, 2026.

## Done
- **Repos set up** from Thunder Push's (thunder-push and thunder-push-math): the RGS client, mock RGS, fixtures pipeline, QA harness (Chrome client, static server, build-ref), Netlify demo gate and CI. All Thunder Push code, art, copy and math has been removed.
- **Math, second pass** (`edelweiss-edge-math`, `games/edelweiss_edge/`):
  - the stop is drawn first from height-based weights, so pay rises toward the edge;
  - stories with calibrated features act it out;
  - blooms are independent of the stop;
  - 92 bet modes, books, optimizer targets and tests.
  See `readme.txt` there. The first pass's 1,000-paths model was replaced.
- **The real screen, first pass** (alpine cartoon, ported from the approved prototype):
  - `src/scene.ts`: the canvas mountain, Ueli, follow-cam, weather, goats, and every feature's moment (gondola, avalanche, echo, föhn, fall, Barry's rescue), hidden blooms bursting as he reaches them, the win stamp.
  - `src/director.ts`: stages a book event by event; cosmetic choices are seeded from the book id.
  - `src/sound.ts`: synthesized sound, one mute (review [107]).
  - The deck is one short row: Menu, Difficulty (a picker showing each width and pay range), bet −/+, balance, and Climb (space bar, review [228]) with Turbo (») on its left and Autoplay (↻) on its right. Autoplay opens a panel first (10/25/50/100 climbs, stop after any win or a 20× win; review [104]); while it runs Climb becomes Stop.
  - Life on the mountain: a paraglider, an eagle, birds, a hot-air balloon, a rescue helicopter and a banner plane drift through the sky; the rock face is a cliff of chunky cartoon stone blocks (darker deeper down, moss low, snow caps high, the odd pine), with a cave with blinking eyes and a waterfall into a splash pool. Only on-screen blocks are drawn.
  - No double-tap or pinch zoom on mobile (review [223]): `touch-action: manipulation` plus a touch guard for iOS Safari.
  - What the window pays and how often it wins sits on a sign above it on the mountain. Drag the sign (or anywhere on the mountain) to move the window, or tap its ◀ ▶ arrows; the arrow keys work too.
  - The menu: sound and turbo toggles and the rules (`src/rules.ts`, built from the exported numbers): pays per difficulty, RTP and max win per mode, the features, edelweiss, every control, and the disclaimer (review [25], [27], [235], [185], [107]). `src/wording.test.ts` renders the social version to check it.
  - No scrolling at any size (review [227]); checked at 1280×720, 430×932 and 400×225. Portrait phones get a steeper ridge.
  - A resumed round shows where it ended instantly; QA probes stage rounds instantly (`game.state.instant`).
- **Fixtures:** `fixtures/books.json`, with 3 losses and 3 wins for each of the 92 modes from the math's `export_fixtures.py`, simulated in-process.

## Next
1. Settle the open questions in `docs/GAME_DESIGN.md`, the mode count first.
2. Run the math's `run.py` (optimizer) and check `stats.py`. Then export fixtures from the published books, so every kind of round (rescue, golden bloom) is covered.
3. Replay polish. Then run `engine-review-prompt.md`.

## Open questions
See `docs/GAME_DESIGN.md`, Open questions.
